const jwt = require('jsonwebtoken');
const config = require('../config');
const { getDocumentType } = require('../utils/fileUtils');

function getOnlyofficeDocumentType(doc) {
  const detectedType = getDocumentType(doc.original_name);

  if (detectedType === 'pdf') {
    return 'word';
  }

  return detectedType;
}

function normalizeZoom(documentType, zoom) {
  if (zoom === undefined || zoom === null || zoom === '') {
    return null;
  }

  if (zoom === 'fit-page') {
    return ['word', 'slide'].includes(documentType) ? -1 : 100;
  }

  if (zoom === 'fit-width') {
    return ['word', 'slide'].includes(documentType) ? -2 : 100;
  }

  const parsedZoom = Number(zoom);
  if (!Number.isFinite(parsedZoom)) {
    return null;
  }

  return Math.min(300, Math.max(50, Math.round(parsedZoom)));
}

function buildEditorConfig(doc, { mode = 'view', callbackUrl, fileUrl, lang = 'zh', zoom } = {}) {
  const documentType = getOnlyofficeDocumentType(doc);
  const normalizedZoom = normalizeZoom(documentType, zoom);

  const payload = {
    document: {
      fileType: doc.file_ext.replace('.', ''),
      key: `${doc.id}_v${doc.version}_${Date.now()}`,
      title: doc.original_name,
      url: fileUrl,
      permissions: {
        comment: mode === 'edit',
        download: true,
        edit: mode === 'edit',
        print: true,
        review: mode === 'edit',
        fillForms: mode === 'edit',
      },
    },
    documentType,
    editorConfig: {
      callbackUrl: callbackUrl || config.onlyoffice.callbackUrl,
      lang,
      mode,
      customization: {
        autosave: true,
        compactHeader: false,
        compactToolbar: false,
        forcesave: true,
        help: false,
        hideRightMenu: mode === 'view',
        hideRulers: mode === 'view',
        logo: {
          image: '',
          imageEmbedded: '',
        },
        toolbarNoTabs: false,
        uiTheme: 'theme-light',
      },
    },
  };

  if (normalizedZoom !== null) {
    payload.editorConfig.customization.zoom = normalizedZoom;
  }

  if (config.onlyoffice.jwtEnabled) {
    const token = jwt.sign(payload, config.onlyoffice.jwtSecret);
    payload.token = token;
  }

  return payload;
}

function verifyCallback(body) {
  if (body.token) {
    try {
      jwt.verify(body.token, config.onlyoffice.jwtSecret);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

module.exports = { buildEditorConfig, verifyCallback };
