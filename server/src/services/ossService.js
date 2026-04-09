const OSS = require('ali-oss');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

let client = null;

function getClient() {
  if (client) return client;
  if (!config.oss.accessKeyId) return null;

  client = new OSS({
    region: config.oss.endpoint.replace('.aliyuncs.com', '').replace('oss-', ''),
    endpoint: `https://${config.oss.endpoint}`,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucketName,
  });
  return client;
}

async function uploadToOSS(filePath, storedName) {
  const oss = getClient();
  if (!oss) return null;

  const ossKey = `documents/${storedName}`;
  try {
    await oss.put(ossKey, filePath);
    const url = `${config.oss.urlPrefix}${ossKey}`;
    logger.info(`OSS upload success: ${ossKey} -> ${url}`);
    return url;
  } catch (err) {
    logger.error('OSS upload failed:', err.message);
    return null;
  }
}

function isEnabled() {
  return !!config.oss.accessKeyId;
}

module.exports = { uploadToOSS, isEnabled };
