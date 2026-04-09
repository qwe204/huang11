const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getFileById, updateFileVersion, logOperation } = require('../services/fileService');
const { verifyCallback } = require('../services/onlyofficeService');
const config = require('../config');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const body = req.body;
    const docId = req.query.id;

    logger.info(`Callback received for doc ${docId}, status: ${body.status}`);

    if (!verifyCallback(body)) {
      logger.warn('Callback verification failed');
      return res.json({ error: 1 });
    }

    // Status codes: https://api.onlyoffice.com/editors/callback
    // 0 - no document, 1 - editing, 2 - ready for saving
    // 3 - saving error, 4 - closing without changes, 6 - force save, 7 - force save error

    if (body.status === 2 || body.status === 6) {
      const downloadUrl = body.url;
      if (!downloadUrl) {
        logger.error('No download URL in callback');
        return res.json({ error: 1 });
      }

      const doc = getFileById(docId);
      if (!doc) {
        logger.error(`Document not found: ${docId}`);
        return res.json({ error: 1 });
      }

      const newVersion = doc.version + 1;
      const newStoredName = `${docId}_v${newVersion}${doc.file_ext}`;
      const newFilePath = path.join(config.storagePath, newStoredName);

      const protocol = downloadUrl.startsWith('https') ? https : http;
      const fileStream = fs.createWriteStream(newFilePath);

      protocol.get(downloadUrl, (response) => {
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          const stats = fs.statSync(newFilePath);
          updateFileVersion(docId, newFilePath, stats.size);
          logOperation(docId, 'save', `文档保存 v${newVersion}`, null);
          logger.info(`Document saved: ${doc.original_name} v${newVersion}`);
        });
      }).on('error', (err) => {
        logger.error('Download edited file failed:', err);
        if (fs.existsSync(newFilePath)) fs.unlinkSync(newFilePath);
      });
    }

    res.json({ error: 0 });
  } catch (err) {
    logger.error('Callback processing failed:', err);
    res.json({ error: 1 });
  }
});

module.exports = router;
