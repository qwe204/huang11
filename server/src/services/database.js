const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const config = require('../config');
const logger = require('../utils/logger');

let db;

function getDb() {
  if (db) return db;

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initTables();
  seedAdmin();
  logger.info('SQLite database initialized at', config.dbPath);
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      nickname TEXT,
      email TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'user',
      status INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      deleted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_ext TEXT NOT NULL,
      document_type TEXT NOT NULL,
      mime_type TEXT,
      upload_user_id INTEGER,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      deleted INTEGER DEFAULT 0,
      FOREIGN KEY (upload_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (document_id) REFERENCES documents(id)
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT,
      user_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted);
    CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
    CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(upload_user_id);
    CREATE INDEX IF NOT EXISTS idx_doc_versions_docid ON document_versions(document_id);
    CREATE INDEX IF NOT EXISTS idx_logs_docid ON operation_logs(document_id);
  `);
}

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync('123456', 10);
    db.prepare(`
      INSERT INTO users (username, password, nickname, role) VALUES (?, ?, ?, ?)
    `).run('admin', hash, '系统管理员', 'admin');
    logger.info('Admin account created: admin / 123456');
  }
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, close };
