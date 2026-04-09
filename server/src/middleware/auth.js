const jwt = require('jsonwebtoken');
const config = require('../config');

function authRequired(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ code: 4010, message: '请先登录' });
  }
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ code: 4010, message: '登录已过期，请重新登录' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ code: 4030, message: '无权限访问' });
    }
    next();
  });
}

function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, config.auth.jwtSecret);
    } catch { /* ignore invalid token */ }
  }
  next();
}

function extractToken(req) {
  if (req.query.token) return req.query.token;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

module.exports = { authRequired, adminRequired, optionalAuth, extractToken };
