const fs = require('fs');
const path = require('path');
const config = require('../config');

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
  '.log',
]);

function sanitizeText(text) {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripRtf(content) {
  return sanitizeText(
    content
      .replace(/\\'[0-9a-fA-F]{2}/g, match => String.fromCharCode(parseInt(match.slice(2), 16)))
      .replace(/\\par[d]?/g, '\n')
      .replace(/\\tab/g, '\t')
      .replace(/\\[a-zA-Z]+\d* ?/g, '')
      .replace(/[{}]/g, '')
  );
}

function readTextExcerpt(doc) {
  if (!doc?.file_path || !fs.existsSync(doc.file_path)) {
    return {
      mode: 'metadata_only',
      excerpt: '',
      warning: '当前文档文件不存在，AI 助手只能根据元数据回答。',
    };
  }

  const ext = path.extname(doc.original_name || doc.file_path).toLowerCase();

  if (!TEXT_EXTENSIONS.has(ext) && ext !== '.rtf') {
    return {
      mode: 'metadata_only',
      excerpt: '',
      warning: '当前文件类型暂未提取正文，AI 回答会更多基于文件名、类型和对话上下文。',
    };
  }

  const raw = fs.readFileSync(doc.file_path, 'utf8');
  const text = ext === '.rtf' ? stripRtf(raw) : sanitizeText(raw);
  const excerpt = text.slice(0, config.ai.maxContextChars);

  if (!excerpt) {
    return {
      mode: 'metadata_only',
      excerpt: '',
      warning: '文档正文为空，AI 助手只能根据元数据回答。',
    };
  }

  return {
    mode: 'text_excerpt',
    excerpt,
    warning: text.length > excerpt.length ? '文档较长，当前仅向模型提供了前部正文片段。' : '',
  };
}

function createSystemPrompt(doc, context) {
  const metadataLines = [
    `文件名：${doc.original_name}`,
    `文件类型：${doc.document_type}`,
    `扩展名：${doc.file_ext}`,
    `版本：v${doc.version}`,
    `大小：${doc.file_size} 字节`,
    `更新时间：${doc.updated_at || '未知'}`,
  ];

  const availabilityLine = context.mode === 'text_excerpt'
    ? '已提供正文摘录，可优先依据摘录内容回答。'
    : '未提供可解析正文，请明确说明你只能基于文件元信息和用户提问作答，不要编造文档细节。';

  const warningLine = context.warning ? `上下文提示：${context.warning}` : '';

  return [
    '你是一个中文文档 AI 助手，负责围绕当前文档回答问题。',
    '回答要求：',
    '1. 优先基于提供的文档内容和元信息回答，不要虚构未提供的事实。',
    '2. 若上下文不足，直接说明“根据当前可用内容无法确认”。',
    '3. 回答保持简洁、清晰、专业，默认使用中文。',
    '4. 如果用户要总结、提纲、风险点，请按条目输出，方便阅读。',
    '',
    '文档元信息：',
    ...metadataLines,
    '',
    `正文可用性：${availabilityLine}`,
    warningLine,
    context.excerpt ? ['', '文档正文摘录：', context.excerpt] : [],
  ]
    .flat()
    .filter(Boolean)
    .join('\n');
}

function normalizeChatMessages(messages = []) {
  return messages
    .filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .map(message => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter(message => message.content)
    .slice(-config.ai.maxHistoryMessages);
}

module.exports = {
  createSystemPrompt,
  normalizeChatMessages,
  readTextExcerpt,
};
