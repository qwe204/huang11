const fs = require('fs');
const path = require('path');

const port = parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || process.env.BIND_HOST || '0.0.0.0';
const defaultAppUrl = `http://localhost:${port}`;
const authJwtSecret = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || 'change_me_auth_secret';
const onlyofficeJwtSecret = process.env.ONLYOFFICE_JWT_SECRET || process.env.JWT_SECRET || 'change_me_onlyoffice_secret';
const onlyofficeUrl = process.env.ONLYOFFICE_URL || 'http://localhost';
const defaultLocalStoragePath = path.join(__dirname, '../../data/documents');
const defaultLocalDbPath = path.join(__dirname, '../../data/db/docpreview.db');
const webRoot = process.env.WEB_ROOT ? path.resolve(process.env.WEB_ROOT) : '';
const serveWeb = process.env.SERVE_WEB === 'true' || (!!webRoot && process.env.SERVE_WEB !== 'false');
const isContainerRuntime = fs.existsSync('/.dockerenv');
const inferredOnlyofficePublicUrl = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(onlyofficeUrl)
  ? onlyofficeUrl
  : null;
const internalPublicUrl = process.env.INTERNAL_PUBLIC_URL || process.env.PUBLIC_URL_INTERNAL || null;
const storagePath = resolveRuntimePath(process.env.STORAGE_PATH, '/data/documents', defaultLocalStoragePath);
const dbPath = resolveRuntimePath(process.env.DB_PATH, '/data/db/docpreview.db', defaultLocalDbPath);
const aiBaseUrl = (process.env.LM_STUDIO_BASE_URL || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '');

function resolveRuntimePath(rawValue, containerDefault, localDefault) {
  const resolvedValue = rawValue || containerDefault;

  if (!isContainerRuntime && /^\/data(\/|$)/.test(resolvedValue)) {
    return localDefault;
  }

  return resolvedValue;
}

module.exports = {
  port,
  host,
  storagePath,
  dbPath,
  auth: {
    jwtSecret: authJwtSecret,
  },
  onlyoffice: {
    url: onlyofficeUrl,
    jwtEnabled: process.env.ONLYOFFICE_JWT_ENABLED !== 'false' && !!onlyofficeJwtSecret,
    jwtSecret: onlyofficeJwtSecret,
    callbackUrl: process.env.CALLBACK_URL || null,
  },
  publicUrl: process.env.PUBLIC_URL || defaultAppUrl,
  internalPublicUrl,
  callbackHost: process.env.CALLBACK_HOST || process.env.CALLBACK_URL?.replace(/\/api\/callback$/, '') || process.env.PUBLIC_URL || defaultAppUrl,
  onlyofficePublicUrl: process.env.ONLYOFFICE_PUBLIC_URL || inferredOnlyofficePublicUrl,
  web: {
    enabled: serveWeb,
    root: webRoot,
  },
  ai: {
    provider: 'lm-studio',
    baseUrl: aiBaseUrl,
    apiKey: process.env.LM_STUDIO_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.LM_STUDIO_MODEL || process.env.AI_MODEL || process.env.OPENAI_MODEL || '',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '120000', 10),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.2'),
    maxContextChars: parseInt(process.env.AI_MAX_CONTEXT_CHARS || '12000', 10),
    maxHistoryMessages: parseInt(process.env.AI_MAX_HISTORY_MESSAGES || '12', 10),
  },
  oss: {
    endpoint: process.env.OSS_ENDPOINT || 'oss-cn-beijing.aliyuncs.com',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucketName: process.env.OSS_BUCKET_NAME || '',
    urlPrefix: process.env.OSS_URL_PREFIX || '',
  },
  upload: {
    maxSize: 200 * 1024 * 1024,
    allowedTypes: [
      '.docx', '.doc', '.odt', '.rtf', '.txt',
      '.xlsx', '.xls', '.ods', '.csv',
      '.pptx', '.ppt', '.odp',
      '.pdf',
      '.wps', '.et', '.dps',
    ],
  },
};
