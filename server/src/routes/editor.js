const express = require('express');
const { getFileByIdForUser } = require('../services/fileService');
const { buildEditorConfig } = require('../services/onlyofficeService');
const config = require('../config');
const { extractToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

function getRequestOrigin(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : (forwardedProto || req.protocol || 'http').split(',')[0].trim();

  return `${protocol}://${req.get('host')}`;
}

function isLoopbackHost(hostname = '') {
  return /^(localhost|127(?:\.\d{1,3}){3}|::1)$/i.test(hostname);
}

function normalizeOrigin(origin) {
  try {
    return new URL(origin).origin;
  } catch {
    return origin;
  }
}

function getDockerReachableHost() {
  try {
    const onlyofficeHost = new URL(config.onlyoffice.url).hostname;
    if (['host.docker.internal', 'gateway.docker.internal'].includes(onlyofficeHost.toLowerCase())) {
      return onlyofficeHost;
    }
  } catch {
    // Ignore invalid config and keep the original origin.
  }

  return null;
}

function getOnlyofficeReachableOrigin(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  const explicitOrigin = config.internalPublicUrl && normalizeOrigin(config.internalPublicUrl);

  if (explicitOrigin) {
    return explicitOrigin;
  }

  try {
    const url = new URL(normalizedOrigin);
    if (!isLoopbackHost(url.hostname)) {
      return url.origin;
    }

    const dockerReachableHost = getDockerReachableHost();
    if (!dockerReachableHost) {
      return url.origin;
    }

    url.hostname = dockerReachableHost;
    return url.origin;
  } catch {
    return normalizedOrigin;
  }
}

function getPreferredAppOrigin(requestOrigin) {
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  const configuredOrigin = config.callbackHost || config.publicUrl;

  if (!configuredOrigin) {
    return normalizedRequestOrigin;
  }

  const normalizedConfiguredOrigin = normalizeOrigin(configuredOrigin);

  try {
    const requestUrl = new URL(normalizedRequestOrigin);
    const configuredUrl = new URL(normalizedConfiguredOrigin);

    if (configuredUrl.host === requestUrl.host) {
      return configuredUrl.origin;
    }

    if (isLoopbackHost(configuredUrl.hostname) && configuredUrl.host !== requestUrl.host) {
      return requestUrl.origin;
    }

    return configuredUrl.origin;
  } catch {
    return normalizedRequestOrigin;
  }
}

function appendAccessToken(url, token) {
  if (!token) {
    return url;
  }

  try {
    const target = new URL(url);
    target.searchParams.set('token', token);
    return target.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }
}

function resolveOnlyofficePublicUrl(requestOrigin) {
  const configured = config.onlyofficePublicUrl || config.onlyoffice.url || '';
  const normalizedConfigured = normalizeOrigin(configured);
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);

  try {
    const configuredUrl = new URL(normalizedConfigured);
    if (!isLoopbackHost(configuredUrl.hostname)) {
      return configuredUrl.origin;
    }

    const requestUrl = new URL(normalizedRequestOrigin);
    configuredUrl.hostname = requestUrl.hostname;
    return configuredUrl.origin;
  } catch {
    return normalizedConfigured || normalizedRequestOrigin;
  }
}

router.get('/config/:id', (req, res) => {
  try {
    const doc = getFileByIdForUser(req.params.id, req.user);
    if (!doc) {
      return res.status(404).json({ code: 4040, message: '文件不存在' });
    }

    const mode = req.query.mode || 'view';
    const lang = req.query.lang || 'zh';
    const zoom = Array.isArray(req.query.zoom) ? req.query.zoom[0] : req.query.zoom;

    const requestOrigin = getRequestOrigin(req);
    const appOrigin = getPreferredAppOrigin(requestOrigin);
    const onlyofficeReachableOrigin = getOnlyofficeReachableOrigin(appOrigin);
    const accessToken = extractToken(req);
    const callbackUrl = `${onlyofficeReachableOrigin}/api/callback?id=${doc.id}`;
    const downloadUrl = `${onlyofficeReachableOrigin}/api/files/${doc.id}/download`;
    const fileUrl = appendAccessToken(downloadUrl, accessToken);

    const editorConfig = buildEditorConfig(doc, {
      mode,
      fileUrl,
      callbackUrl,
      lang,
      zoom,
    });

    const ooUrl = resolveOnlyofficePublicUrl(requestOrigin);

    res.json({
      code: 0,
      message: 'ok',
      data: {
        config: editorConfig,
        apiUrl: `${ooUrl}/web-apps/apps/api/documents/api.js`,
        documentServerUrl: ooUrl,
      },
    });
  } catch (err) {
    logger.error('Get editor config failed:', err);
    res.status(500).json({ code: 5000, message: '获取编辑器配置失败' });
  }
});

module.exports = router;
