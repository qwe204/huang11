const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { getDb } = require('./database');
const {
  getDocumentType,
  getDocumentTypeByExt,
  getExtensionsForDocumentType,
  getFileExtension,
  formatFileSize,
} = require('../utils/fileUtils');
const logger = require('../utils/logger');

function ensureStorageDir() {
  if (!fs.existsSync(config.storagePath)) {
    fs.mkdirSync(config.storagePath, { recursive: true });
  }
}

function isAdminUser(user) {
  return user?.role === 'admin';
}

async function saveFile(file, user = null) {
  ensureStorageDir();
  const db = getDb();
  const id = uuidv4();
  const ext = getFileExtension(file.originalname);
  const storedName = `${id}${ext}`;
  const filePath = path.join(config.storagePath, storedName);
  const uploadUserId = user?.id || null;

  fs.copyFileSync(file.path, filePath);
  fs.unlinkSync(file.path);

  const docType = getDocumentType(file.originalname);

  let ossUrl = null;
  const { uploadToOSS, isEnabled } = require('./ossService');
  if (isEnabled()) {
    ossUrl = await uploadToOSS(filePath, storedName);
  }

  const stmt = db.prepare(`
    INSERT INTO documents (id, original_name, stored_name, file_path, file_size, file_ext, document_type, mime_type, upload_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, file.originalname, storedName, filePath, file.size, ext, docType, file.mimetype, uploadUserId);

  db.prepare(`
    INSERT INTO document_versions (document_id, version, file_path, file_size)
    VALUES (?, 1, ?, ?)
  `).run(id, filePath, file.size);

  logger.info(`File saved: ${file.originalname} -> ${storedName}${ossUrl ? ' (OSS: ' + ossUrl + ')' : ''}`);

  return {
    id,
    originalName: file.originalname,
    storedName,
    fileSize: file.size,
    fileSizeFormatted: formatFileSize(file.size),
    fileExt: ext,
    documentType: docType,
    uploadUserId,
    ossUrl,
  };
}

async function saveGeneratedFile({ buffer, originalName, mimeType = '', user = null }) {
  ensureStorageDir();
  const db = getDb();
  const id = uuidv4();
  const ext = getFileExtension(originalName);
  const storedName = `${id}${ext}`;
  const filePath = path.join(config.storagePath, storedName);
  const uploadUserId = user?.id || null;
  const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const fileSize = fileBuffer.length;
  const docType = getDocumentType(originalName);

  fs.writeFileSync(filePath, fileBuffer);

  let ossUrl = null;
  const { uploadToOSS, isEnabled } = require('./ossService');
  if (isEnabled()) {
    ossUrl = await uploadToOSS(filePath, storedName);
  }

  db.prepare(`
    INSERT INTO documents (id, original_name, stored_name, file_path, file_size, file_ext, document_type, mime_type, upload_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, originalName, storedName, filePath, fileSize, ext, docType, mimeType, uploadUserId);

  db.prepare(`
    INSERT INTO document_versions (document_id, version, file_path, file_size)
    VALUES (?, 1, ?, ?)
  `).run(id, filePath, fileSize);

  logger.info(`Generated file saved: ${originalName} -> ${storedName}${ossUrl ? ' (OSS: ' + ossUrl + ')' : ''}`);

  return {
    ...getFileById(id),
    fileSizeFormatted: formatFileSize(fileSize),
    ossUrl,
  };
}

function resolveDocumentPath(doc) {
  if (!doc) return null;

  const candidatePaths = [
    doc.file_path,
    doc.stored_name ? path.join(config.storagePath, doc.stored_name) : null,
  ].filter(Boolean);

  const resolvedPath = candidatePaths.find(candidate => fs.existsSync(candidate));
  const inferredType = getDocumentTypeByExt(doc.file_ext || getFileExtension(doc.original_name || doc.stored_name || ''));

  return {
    ...doc,
    document_type: inferredType,
    file_path: resolvedPath || doc.file_path,
  };
}

function getFileById(id) {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND deleted = 0').get(id);
  return resolveDocumentPath(doc);
}

function getFileByIdForUser(id, user) {
  if (isAdminUser(user)) {
    return getFileById(id);
  }

  if (!user?.id) {
    return null;
  }

  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND deleted = 0 AND upload_user_id = ?').get(id, user.id);
  return resolveDocumentPath(doc);
}

function listFiles({ page = 1, size = 20, keyword = '', type = '' }, user = null) {
  const db = getDb();
  const offset = (page - 1) * size;
  let where = 'deleted = 0';
  const params = [];

  if (keyword) {
    where += ' AND original_name LIKE ?';
    params.push(`%${keyword}%`);
  }
  if (type) {
    const allowedExtensions = getExtensionsForDocumentType(type);
    if (!allowedExtensions.length) {
      where += ' AND 1 = 0';
    } else {
      where += ` AND LOWER(file_ext) IN (${allowedExtensions.map(() => '?').join(', ')})`;
      params.push(...allowedExtensions);
    }
  }

  if (!isAdminUser(user)) {
    where += ' AND upload_user_id = ?';
    params.push(user?.id || 0);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM documents WHERE ${where}`).get(...params).count;
  const records = db.prepare(
    `SELECT * FROM documents WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, size, offset);

  return {
    records: records.map(r => ({
      ...resolveDocumentPath(r),
      fileSizeFormatted: formatFileSize(r.file_size),
    })),
    total,
    page,
    size,
  };
}

function deleteFile(id) {
  const db = getDb();
  const doc = getFileById(id);
  if (!doc) return null;

  db.prepare('UPDATE documents SET deleted = 1, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(id);
  logger.info(`File soft-deleted: ${doc.original_name}`);
  return doc;
}

function deleteFileForUser(id, user) {
  const db = getDb();
  const doc = getFileByIdForUser(id, user);
  if (!doc) return null;

  db.prepare('UPDATE documents SET deleted = 1, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(id);
  logger.info(`File soft-deleted: ${doc.original_name}`);
  return doc;
}

function updateFileVersion(id, newFilePath, newSize) {
  const db = getDb();
  const doc = getFileById(id);
  if (!doc) return null;

  const newVersion = doc.version + 1;

  db.prepare(`
    UPDATE documents SET version = ?, file_size = ?, file_path = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(newVersion, newSize, newFilePath, id);

  db.prepare(`
    INSERT INTO document_versions (document_id, version, file_path, file_size) VALUES (?, ?, ?, ?)
  `).run(id, newVersion, newFilePath, newSize);

  return { ...doc, version: newVersion };
}

function logOperation(documentId, action, detail, ipAddress, userId = null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO operation_logs (document_id, user_id, action, detail, ip_address) VALUES (?, ?, ?, ?, ?)
  `).run(documentId, userId, action, detail, ipAddress);
}

module.exports = {
  saveFile,
  saveGeneratedFile,
  getFileById,
  getFileByIdForUser,
  listFiles,
  deleteFile,
  deleteFileForUser,
  updateFileVersion,
  logOperation,
};
