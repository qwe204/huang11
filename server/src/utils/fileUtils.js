const path = require('path');

const DOCUMENT_TYPE_EXTENSIONS = {
  word: ['.docx', '.doc', '.odt', '.rtf', '.txt', '.wps'],
  cell: ['.xlsx', '.xls', '.ods', '.csv', '.et'],
  slide: ['.pptx', '.ppt', '.odp', '.dps'],
  pdf: ['.pdf'],
};

const FORMAT_MAP = Object.entries(DOCUMENT_TYPE_EXTENSIONS).reduce((acc, [type, extensions]) => {
  extensions.forEach(extension => {
    acc[extension] = type;
  });
  return acc;
}, {});

function normalizeExtension(extension = '') {
  if (!extension) {
    return '';
  }

  return extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
}

function getDocumentTypeByExt(extension) {
  return FORMAT_MAP[normalizeExtension(extension)] || 'word';
}

function getDocumentType(filename) {
  return getDocumentTypeByExt(path.extname(filename));
}

function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

function getExtensionsForDocumentType(type) {
  return DOCUMENT_TYPE_EXTENSIONS[type] || [];
}

function isAllowedType(filename, allowedTypes) {
  const ext = getFileExtension(filename);
  return allowedTypes.includes(ext);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

module.exports = {
  getDocumentType,
  getDocumentTypeByExt,
  getExtensionsForDocumentType,
  getFileExtension,
  isAllowedType,
  formatFileSize,
};
