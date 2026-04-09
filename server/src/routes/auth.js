const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../services/database');
const { authRequired } = require('../middleware/auth');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ code: 4001, message: '请输入用户名和密码' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND deleted = 0').get(username);

    if (!user) {
      return res.status(400).json({ code: 4001, message: '用户名或密码错误' });
    }

    if (user.status !== 1) {
      return res.status(403).json({ code: 4030, message: '账号已被禁用' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ code: 4001, message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, nickname: user.nickname, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: '7d' }
    );

    logger.info(`User logged in: ${username}`);

    res.json({
      code: 0,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
        },
      },
    });
  } catch (err) {
    logger.error('Login failed:', err);
    res.status(500).json({ code: 5000, message: '登录失败' });
  }
});

router.post('/register', (req, res) => {
  try {
    const { username, password, nickname, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 4001, message: '请输入用户名和密码' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ code: 4001, message: '用户名长度为 3-20 个字符' });
    }

    if (password.length < 6) {
      return res.status(400).json({ code: 4001, message: '密码长度至少 6 个字符' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ code: 4001, message: '用户名已存在' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, password, nickname, email, role) VALUES (?, ?, ?, ?, 'user')
    `).run(username, hash, nickname || username, email || null);

    const token = jwt.sign(
      { id: result.lastInsertRowid, username, nickname: nickname || username, role: 'user' },
      config.auth.jwtSecret,
      { expiresIn: '7d' }
    );

    logger.info(`User registered: ${username}`);

    res.json({
      code: 0,
      message: '注册成功',
      data: {
        token,
        user: {
          id: result.lastInsertRowid,
          username,
          nickname: nickname || username,
          email: email || null,
          role: 'user',
        },
      },
    });
  } catch (err) {
    logger.error('Register failed:', err);
    res.status(500).json({ code: 5000, message: '注册失败' });
  }
});

router.get('/me', authRequired, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, username, nickname, email, avatar, role, created_at FROM users WHERE id = ? AND deleted = 0').get(req.user.id);
    if (!user) {
      return res.status(404).json({ code: 4040, message: '用户不存在' });
    }
    res.json({ code: 0, message: 'ok', data: user });
  } catch (err) {
    logger.error('Get user info failed:', err);
    res.status(500).json({ code: 5000, message: '获取用户信息失败' });
  }
});

router.put('/profile', authRequired, (req, res) => {
  try {
    const { nickname, email, avatar } = req.body;
    const db = getDb();
    db.prepare(`
      UPDATE users SET nickname = COALESCE(?, nickname), email = COALESCE(?, email), avatar = COALESCE(?, avatar), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(nickname || null, email || null, avatar || null, req.user.id);
    res.json({ code: 0, message: '更新成功' });
  } catch (err) {
    logger.error('Update profile failed:', err);
    res.status(500).json({ code: 5000, message: '更新失败' });
  }
});

router.put('/password', authRequired, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 4001, message: '请输入原密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ code: 4001, message: '新密码长度至少 6 个字符' });
    }

    const db = getDb();
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ code: 4001, message: '原密码错误' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(hash, req.user.id);
    res.json({ code: 0, message: '密码修改成功' });
  } catch (err) {
    logger.error('Change password failed:', err);
    res.status(500).json({ code: 5000, message: '修改密码失败' });
  }
});

module.exports = router;
