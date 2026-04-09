const config = require('../config');
const { isAllowedType } = require('../utils/fileUtils');

function validateUpload(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ code: 4001, message: '请选择要上传的文件' });
  }

  if (req.file.size > config.upload.maxSize) {
    return res.status(400).json({
      code: 4001,
      message: `文件大小超过限制（最大 ${Math.round(config.upload.maxSize / 1024 / 1024)}MB）`,
    });
  }

  if (!isAllowedType(req.file.originalname, config.upload.allowedTypes)) {
    return res.status(400).json({
      code: 4001,
      message: `不支持的文件格式，支持: ${config.upload.allowedTypes.join(', ')}`,
    });
  }

  next();
}

module.exports = { validateUpload };
