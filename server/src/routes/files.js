const express = require('express');
const fs = require('fs');
const { getFileByIdForUser, listFiles, deleteFileForUser, logOperation } = require('../services/fileService');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const { page = 1, size = 20, keyword = '', type = '' } = req.query;
    const result = listFiles({ page: parseInt(page, 10), size: parseInt(size, 10), keyword, type }, req.user);
    res.json({ code: 0, message: 'ok', data: result });
  } catch (err) {
    logger.error('List files failed:', err);
    res.status(500).json({ code: 5000, message: '获取文件列表失败' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const doc = getFileByIdForUser(req.params.id, req.user);
    if (!doc) {
      return res.status(404).json({ code: 4040, message: '文件不存在' });
    }

    res.json({ code: 0, message: 'ok', data: doc });
  } catch (err) {
    logger.error('Get file failed:', err);
    res.status(500).json({ code: 5000, message: '获取文件信息失败' });
  }
});

router.get('/:id/download', (req, res) => {
  try {
    const doc = getFileByIdForUser(req.params.id, req.user);
    if (!doc) {
      return res.status(404).json({ code: 4040, message: '文件不存在' });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ code: 4040, message: '文件已被移除' });
    }

    logOperation(doc.id, 'download', `下载文件: ${doc.original_name}`, req.ip, req.user?.id || null);

    const encodedName = encodeURIComponent(doc.original_name);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.sendFile(doc.file_path);
  } catch (err) {
    logger.error('Download failed:', err);
    res.status(500).json({ code: 5000, message: '下载失败' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = deleteFileForUser(req.params.id, req.user);
    if (!result) {
      return res.status(404).json({ code: 4040, message: '文件不存在' });
    }

    logOperation(req.params.id, 'delete', `删除文件: ${result.original_name}`, req.ip, req.user?.id || null);
    res.json({ code: 0, message: '删除成功' });
  } catch (err) {
    logger.error('Delete failed:', err);
    res.status(500).json({ code: 5000, message: '删除失败' });
  }
});

module.exports = router;
