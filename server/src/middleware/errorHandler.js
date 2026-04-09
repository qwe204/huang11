const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error:', err.message, err.stack);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 4001, message: '文件大小超过限制' });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ code: 4001, message: '无效的文件字段' });
  }

  res.status(500).json({ code: 5000, message: '服务器内部错误' });
}

module.exports = errorHandler;
