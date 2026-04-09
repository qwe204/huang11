require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const { authRequired } = require('./middleware/auth');
const logger = require('./utils/logger');
const { getDb, close: closeDb } = require('./services/database');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

getDb();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/upload', authRequired, require('./routes/upload'));
app.use('/api/files', authRequired, require('./routes/files'));
app.use('/api/editor', authRequired, require('./routes/editor'));
app.use('/api/callback', require('./routes/callback'));
app.use('/api/ai', authRequired, require('./routes/ai'));

app.get('/api/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'running', timestamp: new Date().toISOString() } });
});

app.get('/api/formats', (_req, res) => {
  res.json({
    code: 0,
    message: 'ok',
    data: {
      supported: config.upload.allowedTypes,
      maxSize: config.upload.maxSize,
      maxSizeMB: Math.round(config.upload.maxSize / 1024 / 1024),
    },
  });
});

function mountWebUiIfEnabled() {
  if (!config.web.enabled || !config.web.root) {
    return;
  }

  const indexFile = path.join(config.web.root, 'index.html');
  if (!fs.existsSync(indexFile)) {
    logger.warn(`Web UI root does not contain index.html: ${config.web.root}`);
    return;
  }

  app.use(express.static(config.web.root));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(indexFile);
  });

  logger.info(`Web UI enabled: ${config.web.root}`);
}

mountWebUiIfEnabled();
app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  logger.info(`Doc Preview Server running on ${config.host}:${config.port}`);
  logger.info(`OnlyOffice URL: ${config.onlyoffice.url}`);
  logger.info(`Storage: ${config.storagePath}`);
});

function shutdown() {
  logger.info('Shutting down...');
  closeDb();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
