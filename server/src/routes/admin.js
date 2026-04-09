const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../services/database');
const { adminRequired } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.use(adminRequired);

router.get('/users', (req, res) => {
  try {
    const { page = 1, size = 20, keyword = '', role = '' } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(size);
    let where = 'deleted = 0';
    const params = [];

    if (keyword) {
      where += ' AND (username LIKE ? OR nickname LIKE ? OR email LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (role) {
      where += ' AND role = ?';
      params.push(role);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM users WHERE ${where}`).get(...params).count;
    const records = db.prepare(
      `SELECT id, username, nickname, email, avatar, role, status, created_at, updated_at FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(size), offset);

    res.json({ code: 0, message: 'ok', data: { records, total, page: parseInt(page), size: parseInt(size) } });
  } catch (err) {
    logger.error('List users failed:', err);
    res.status(500).json({ code: 5000, message: '获取用户列表失败' });
  }
});

router.post('/users', (req, res) => {
  try {
    const { username, password, nickname, email, role = 'user' } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 4001, message: '请输入用户名和密码' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ code: 4001, message: '用户名已存在' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, password, nickname, email, role) VALUES (?, ?, ?, ?, ?)
    `).run(username, hash, nickname || username, email || null, role);

    logger.info(`Admin created user: ${username}`);
    res.json({ code: 0, message: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (err) {
    logger.error('Create user failed:', err);
    res.status(500).json({ code: 5000, message: '创建用户失败' });
  }
});

router.put('/users/:id', (req, res) => {
  try {
    const { nickname, email, role, status } = req.body;
    const db = getDb();

    const user = db.prepare('SELECT id FROM users WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 4040, message: '用户不存在' });
    }

    db.prepare(`
      UPDATE users SET
        nickname = COALESCE(?, nickname),
        email = COALESCE(?, email),
        role = COALESCE(?, role),
        status = COALESCE(?, status),
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(nickname ?? null, email ?? null, role ?? null, status ?? null, req.params.id);

    res.json({ code: 0, message: '更新成功' });
  } catch (err) {
    logger.error('Update user failed:', err);
    res.status(500).json({ code: 5000, message: '更新用户失败' });
  }
});

router.put('/users/:id/reset-password', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ code: 4001, message: '密码长度至少 6 个字符' });
    }

    const db = getDb();
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(hash, req.params.id);

    res.json({ code: 0, message: '密码重置成功' });
  } catch (err) {
    logger.error('Reset password failed:', err);
    res.status(500).json({ code: 5000, message: '重置密码失败' });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT username, role FROM users WHERE id = ? AND deleted = 0').get(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 4040, message: '用户不存在' });
    }

    if (user.username === 'admin') {
      return res.status(400).json({ code: 4001, message: '不能删除超级管理员' });
    }

    db.prepare('UPDATE users SET deleted = 1, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(req.params.id);
    logger.info(`Admin deleted user: ${user.username}`);
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    logger.error('Delete user failed:', err);
    res.status(500).json({ code: 5000, message: '删除用户失败' });
  }
});

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE deleted = 0').get().count;
    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE deleted = 0').get().count;
    const totalSize = db.prepare('SELECT COALESCE(SUM(file_size), 0) as total FROM documents WHERE deleted = 0').get().total;
    const recentLogs = db.prepare('SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 10').all();

    res.json({
      code: 0,
      message: 'ok',
      data: { userCount, docCount, totalSize, recentLogs },
    });
  } catch (err) {
    logger.error('Get stats failed:', err);
    res.status(500).json({ code: 5000, message: '获取统计数据失败' });
  }
});

module.exports = router;
