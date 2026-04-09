const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { validateUpload } = require('../middleware/fileValidator');
const { saveFile, logOperation } = require('../services/fileService');
const logger = require('../utils/logger');

const router = express.Router();

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post('/', upload.single('file'), validateUpload, async (req, res) => {
  try {
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    req.file.originalname = originalName;
    const result = await saveFile(req.file, req.user);
    logOperation(result.id, 'upload', `上传文件: ${result.originalName}`, req.ip, req.user?.id || null);
    logger.info(`Upload success: ${result.originalName}`);
    res.json({ code: 0, message: '上传成功', data: result });
  } catch (err) {
    logger.error('Upload failed:', err);
    res.status(500).json({ code: 5000, message: '上传失败: ' + err.message });
  }
});

module.exports = router;
