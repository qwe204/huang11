const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const PptxGenJS = require('pptxgenjs');
const {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} = require('docx');
const config = require('../config');
const { createChatCompletion } = require('./aiService');
const { readTextExcerpt } = require('./documentAiService');
const { saveGeneratedFile } = require('./fileService');
const { formatFileSize, getFileExtension } = require('../utils/fileUtils');

const SPREADSHEET_EXTENSIONS = new Set(['.xlsx', '.xls', '.ods', '.csv', '.et']);
const DOCX_EXTENSIONS = new Set(['.docx']);
const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
];

const PPT_TEMPLATES = {
  biz: {
    name: '商务极简',
    description: '适合经营汇报、高层简报，视觉克制、结论前置。',
    background: 'F7F9FF',
    surface: 'FFFFFF',
    accent: '4F6BFF',
    accentSoft: 'E8EEFF',
    text: '162033',
    muted: '64748B',
  },
  dark: {
    name: '科技曜黑',
    description: '适合技术方案、架构升级与产品发布，气质稳重偏未来感。',
    background: '111827',
    surface: '1F2937',
    accent: '8AB4FF',
    accentSoft: '243244',
    text: 'F8FAFC',
    muted: 'CBD5E1',
  },
  edu: {
    name: '教学培训',
    description: '适合课程培训、内部分享与知识沉淀，层次清晰、便于讲解。',
    background: 'F8FAFF',
    surface: 'FFFFFF',
    accent: '5F7CFF',
    accentSoft: 'EAF0FF',
    text: '1F2937',
    muted: '64748B',
  },
  brand: {
    name: '活动策划',
    description: '适合品牌传播、活动方案与节庆主题，视觉鲜明、节奏感更强。',
    background: 'F7F8F2',
    surface: 'FFFFFF',
    accent: '2F7B4C',
    accentSoft: 'E8F5EC',
    text: '17311F',
    muted: '4E6A58',
  },
  light: {
    name: '简报白昼',
    description: '适合周报月报、项目进度同步，明亮简洁、信息密度高。',
    background: 'FFFFFF',
    surface: 'F7F9FC',
    accent: '92A5FF',
    accentSoft: 'EEF2FF',
    text: '1F2937',
    muted: '6B7280',
  },
  blue: {
    name: '研究蓝图',
    description: '适合研究分享、洞察分析与专题汇报，强调可信度和信息组织。',
    background: 'F4FAFF',
    surface: 'FFFFFF',
    accent: '3E90D0',
    accentSoft: 'E4F2FF',
    text: '183B56',
    muted: '5D7184',
  },
};

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\u0000/g, '')
    .trim();
}

function normalizeWhitespace(value) {
  return cleanText(value)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

function sanitizeFileNameSegment(value, fallback = 'AI文档') {
  const normalized = cleanText(value)
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.slice(0, 36) || fallback;
}

function createTimestamp() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ];
  const time = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ];

  return `${parts.join('')}-${time.join('')}`;
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === '') {
    return [];
  }

  return [value];
}

function normalizeTextList(value, max = 8) {
  return ensureArray(value)
    .flatMap(item => cleanText(item).split(/\n+/))
    .map(item => item.replace(/^[\s\-•\d一二三四五六七八九十、.()（）]+/, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function truncateText(value, maxLength = 1500) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function formatMetricMap(entries) {
  return Object.fromEntries(
    entries.filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function extractTargetSize(scale, fallback = 6) {
  const matches = String(scale || '').match(/\d+/g);
  if (!matches?.length) {
    return fallback;
  }

  const average = matches.reduce((sum, item) => sum + Number(item), 0) / matches.length;
  return Math.max(4, Math.round(average));
}

function extractJsonPayload(text) {
  const source = cleanText(text);
  if (!source) {
    return null;
  }

  const candidates = [];
  const fencedJson = source.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson?.[1]) {
    candidates.push(fencedJson[1]);
  }

  const fencedPlain = source.match(/```\s*([\s\S]*?)```/);
  if (fencedPlain?.[1]) {
    candidates.push(fencedPlain[1]);
  }

  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(source.slice(firstBrace, lastBrace + 1));
  }

  candidates.push(source);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // keep trying
    }
  }

  return null;
}

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'');
}

function normalizeReferenceContext(doc, context) {
  return {
    referenceFileName: doc?.original_name || '',
    referenceMode: context.mode,
    warning: context.warning || '',
    extractedText: !!context.extractedText,
  };
}

async function readDocxExcerpt(doc) {
  if (!doc?.file_path || !fs.existsSync(doc.file_path)) {
    return {
      mode: 'metadata_only',
      excerpt: '',
      warning: '参考 Word 文件不存在，已退回到元数据模式。',
      extractedText: false,
    };
  }

  const buffer = fs.readFileSync(doc.file_path);
  const zip = await JSZip.loadAsync(buffer);
  const documentEntry = zip.file('word/document.xml');

  if (!documentEntry) {
    return {
      mode: 'metadata_only',
      excerpt: '',
      warning: '当前 Word 文件未找到正文结构，无法抽取参考正文。',
      extractedText: false,
    };
  }

  const xml = await documentEntry.async('string');
  const text = normalizeWhitespace(
    decodeXmlEntities(
      xml
        .replace(/<w:p\b[^>]*>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br\/>/g, '\n')
        .replace(/<w:cr\/>/g, '\n')
        .replace(/<[^>]+>/g, '')
    )
  );

  if (!text) {
    return {
      mode: 'metadata_only',
      excerpt: '',
      warning: '当前 Word 文件正文为空，无法抽取参考内容。',
      extractedText: false,
    };
  }

  const excerpt = text.slice(0, config.ai.maxContextChars);

  return {
    mode: 'text_excerpt',
    excerpt,
    warning: text.length > excerpt.length ? '参考 Word 正文较长，已按最大上下文长度截断。' : '',
    extractedText: true,
  };
}

function normalizeCellValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function toNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value || '')
    .replace(/,/g, '')
    .replace(/%$/, '')
    .trim();

  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundNumber(value) {
  return Math.round(value * 100) / 100;
}

function summarizeSpreadsheet(doc) {
  if (!doc?.file_path || !fs.existsSync(doc.file_path)) {
    return {
      mode: 'metadata_only',
      warning: '参考表格文件不存在，无法抽取数据摘要。',
      extractedText: false,
      sheetName: '',
      rowCount: 0,
      columnCount: 0,
      headers: [],
      previewRows: [],
      numericColumns: [],
      summaryText: '',
    };
  }

  const workbook = XLSX.readFile(doc.file_path, {
    cellDates: true,
    raw: false,
    dense: true,
  });
  const sheetName = workbook.SheetNames[0] || '';
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  }).filter(row => Array.isArray(row) && row.some(cell => normalizeCellValue(cell)));

  if (!rawRows.length) {
    return {
      mode: 'metadata_only',
      warning: '表格内容为空，无法生成有效分析。',
      extractedText: false,
      sheetName,
      rowCount: 0,
      columnCount: 0,
      headers: [],
      previewRows: [],
      numericColumns: [],
      summaryText: '',
    };
  }

  const headerRow = rawRows[0] || [];
  const headers = headerRow.map((value, index) => normalizeCellValue(value) || `列${index + 1}`);
  const bodyRows = rawRows.slice(1);
  const sampledRows = bodyRows.slice(0, 6);
  const previewRows = sampledRows.map(row => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = normalizeCellValue(row[index]);
    });
    return entry;
  });

  const numericColumns = headers
    .map((header, index) => {
      const values = bodyRows
        .map(row => toNumericValue(row[index]))
        .filter(value => value !== null);

      if (values.length < 2) {
        return null;
      }

      const sum = values.reduce((total, current) => total + current, 0);
      return {
        name: header,
        count: values.length,
        min: roundNumber(Math.min(...values)),
        max: roundNumber(Math.max(...values)),
        avg: roundNumber(sum / values.length),
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  const summaryParts = [
    `表格名称：${doc.original_name}`,
    `工作表：${sheetName || '未命名工作表'}`,
    `数据规模：${bodyRows.length} 行 × ${headers.length} 列`,
    headers.length ? `字段示例：${headers.slice(0, 10).join('、')}` : '',
    numericColumns.length
      ? `数值列统计：${numericColumns.map(item => `${item.name}(均值 ${item.avg})`).join('；')}`
      : '',
    previewRows.length ? `样例数据：${JSON.stringify(previewRows, null, 2)}` : '',
  ].filter(Boolean);

  return {
    mode: 'spreadsheet',
    warning: bodyRows.length > 200 ? '表格数据较大，模型当前基于前 200 行样本和字段统计生成分析。' : '',
    extractedText: true,
    sheetName,
    rowCount: bodyRows.length,
    columnCount: headers.length,
    headers,
    previewRows,
    numericColumns,
    summaryText: truncateText(summaryParts.join('\n'), config.ai.maxContextChars),
  };
}

async function buildReferenceContext(doc, purpose = 'text') {
  if (!doc) {
    return {
      mode: 'none',
      excerpt: '',
      warning: '',
      extractedText: false,
    };
  }

  const extension = getFileExtension(doc.original_name || doc.file_path);
  if (purpose === 'spreadsheet' && SPREADSHEET_EXTENSIONS.has(extension)) {
    return summarizeSpreadsheet(doc);
  }

  if (DOCX_EXTENSIONS.has(extension)) {
    return readDocxExcerpt(doc);
  }

  const textContext = readTextExcerpt(doc);
  return {
    ...textContext,
    extractedText: textContext.mode === 'text_excerpt',
  };
}

function buildReferencePrompt(doc, context) {
  if (!doc) {
    return '当前没有参考文件，请仅基于用户输入生成结果。';
  }

  const metadataLines = [
    `参考文件：${doc.original_name}`,
    `文件类型：${doc.document_type}`,
    `扩展名：${doc.file_ext}`,
    `文件大小：${formatFileSize(doc.file_size)}`,
    `更新时间：${doc.updated_at || '未知'}`,
  ];

  if (context.mode === 'spreadsheet') {
    return [
      ...metadataLines,
      `解析方式：电子表格摘要（${context.sheetName || '首个工作表'}）`,
      context.warning ? `限制说明：${context.warning}` : '',
      context.summaryText ? `表格摘要：\n${context.summaryText}` : '',
    ].filter(Boolean).join('\n');
  }

  if (context.mode === 'text_excerpt') {
    return [
      ...metadataLines,
      '解析方式：正文摘录',
      context.warning ? `限制说明：${context.warning}` : '',
      context.excerpt ? `参考正文：\n${context.excerpt}` : '',
    ].filter(Boolean).join('\n');
  }

  return [
    ...metadataLines,
    '解析方式：元数据模式',
    context.warning ? `限制说明：${context.warning}` : '当前参考文件无法抽取正文，请不要虚构未提供的细节。',
  ].join('\n');
}

function normalizeSection(section, index) {
  const heading = cleanText(section?.heading || section?.title || `第 ${index + 1} 部分`);
  const paragraphs = normalizeTextList(section?.paragraphs || section?.content || section?.paragraph, 10);
  const bullets = normalizeTextList(section?.bullets || section?.points || section?.items, 8);
  const level = Math.min(
    4,
    Math.max(1, Number(section?.level || section?.headingLevel || 1))
  );

  return {
    heading,
    paragraphs,
    bullets,
    level,
  };
}

function fallbackWordResult(reply, prompt) {
  const blocks = normalizeWhitespace(reply)
    .split(/\n{2,}/)
    .map(block => block.split('\n').map(line => line.trim()).filter(Boolean))
    .filter(block => block.length);

  const sections = blocks.map((block, index) => ({
    heading: block[0].replace(/^[#\d一二三四五六七八九十、.()（）]+/, '').trim() || `第 ${index + 1} 部分`,
    paragraphs: block.slice(1).map(line => line.replace(/^[\-•]/, '').trim()).filter(Boolean),
    bullets: [],
    level: 1,
  }));

  const normalizedSections = sections.filter(section => section.heading || section.paragraphs.length);
  return {
    title: sanitizeFileNameSegment(prompt, 'AI文档初稿'),
    subtitle: '',
    summary: cleanText(blocks[0]?.[0] || prompt || 'AI 文档生成结果'),
    sections: normalizedSections.length ? normalizedSections : [{
      heading: '正文',
      paragraphs: normalizeTextList(reply, 12),
      bullets: [],
      level: 1,
    }],
    actionItems: [],
  };
}

function normalizeWordResult(payload, prompt, reply) {
  if (!payload || typeof payload !== 'object') {
    return fallbackWordResult(reply, prompt);
  }

  const sections = ensureArray(payload.sections)
    .map((section, index) => normalizeSection(section, index))
    .filter(section => section.heading || section.paragraphs.length || section.bullets.length);

  return {
    title: cleanText(payload.title) || sanitizeFileNameSegment(prompt, 'AI文档初稿'),
    subtitle: cleanText(payload.subtitle || payload.topic),
    summary: cleanText(payload.summary || payload.abstract || payload.intro),
    sections: sections.length ? sections : fallbackWordResult(reply, prompt).sections,
    actionItems: normalizeTextList(payload.actionItems || payload.actions || payload.nextSteps, 8),
  };
}

function buildWordPrompt({ prompt, scale, language, extra, inputMode, referencePrompt }) {
  return [
    '任务类型：Word 文档生成',
    `输入模式：${inputMode || 'generate'}`,
    `输出规模：${scale || '标准长度'}`,
    `语言风格：${language || '简体中文'}`,
    `附加要求：${extra || '正文 + 摘要'}`,
    '',
    `用户需求：${prompt || '请根据参考资料生成完整文档'}`,
    '',
    '参考上下文：',
    referencePrompt,
  ].join('\n');
}

function createWordSystemPrompt() {
  return [
    '你是一名中文办公文档生成助手，擅长生成结构清晰、表达正式、可直接用于办公场景的文稿。',
    '请严格输出 JSON，不要输出 Markdown、解释或多余文字。',
    'JSON 结构如下：',
    '{',
    '  "title": "文档标题",',
    '  "subtitle": "可选副标题",',
    '  "summary": "2-4 句摘要",',
    '  "sections": [',
    '    {',
    '      "heading": "一级标题",',
    '      "level": 1,',
    '      "paragraphs": ["正文段落 1", "正文段落 2"],',
    '      "bullets": ["要点 1", "要点 2"]',
    '    }',
    '  ],',
    '  "actionItems": ["后续动作 1", "后续动作 2"]',
    '}',
    '要求：',
    '1. 优先使用用户提供的需求和参考文件内容，不要捏造未提供的事实。',
    '2. 标题和内容要贴近正式办公写作，避免口语化。',
    '3. sections 至少 3 个，且内容要完整可用。',
    '4. actionItems 仅在确实有后续建议时填写，没有可返回空数组。',
  ].join('\n');
}

function createDocxParagraphsFromSections(sections) {
  const children = [];

  sections.forEach(section => {
    children.push(new Paragraph({
      text: section.heading,
      heading: HEADING_LEVELS[(section.level || 1) - 1] || HeadingLevel.HEADING_1,
      spacing: { before: 220, after: 120 },
    }));

    section.paragraphs.forEach(paragraph => {
      children.push(new Paragraph({
        children: [new TextRun({ text: paragraph, size: 24 })],
        spacing: { after: 160, line: 360 },
      }));
    });

    section.bullets.forEach(item => {
      children.push(new Paragraph({
        text: item,
        bullet: { level: 0 },
        spacing: { after: 80, line: 320 },
      }));
    });
  });

  return children;
}

async function createWordDocumentBuffer(content) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: content.title,
          bold: true,
          size: 34,
          font: 'Microsoft YaHei',
        }),
      ],
    }),
  ];

  if (content.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [
        new TextRun({
          text: content.subtitle,
          italics: true,
          size: 22,
          color: '5B6575',
          font: 'Microsoft YaHei',
        }),
      ],
    }));
  }

  if (content.summary) {
    children.push(new Paragraph({
      text: '摘要',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 140, after: 100 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: content.summary, size: 24 })],
      spacing: { after: 200, line: 360 },
    }));
  }

  children.push(...createDocxParagraphsFromSections(content.sections));

  if (content.actionItems?.length) {
    children.push(new Paragraph({
      text: '后续建议',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 220, after: 120 },
    }));
    content.actionItems.forEach(item => {
      children.push(new Paragraph({
        text: item,
        bullet: { level: 0 },
        spacing: { after: 80, line: 320 },
      }));
    });
  }

  const document = new Document({
    creator: 'GD Document AI',
    title: content.title,
    description: content.summary || content.title,
    sections: [{
      children,
    }],
  });

  return Packer.toBuffer(document);
}

async function generateWordWorkflow({ prompt, scale, language, extra, inputMode, referenceDoc, user }) {
  const referenceContext = await buildReferenceContext(referenceDoc, 'text');
  const completion = await createChatCompletion({
    systemPrompt: createWordSystemPrompt(),
    messages: [{
      role: 'user',
      content: buildWordPrompt({
        prompt,
        scale,
        language,
        extra,
        inputMode,
        referencePrompt: buildReferencePrompt(referenceDoc, referenceContext),
      }),
    }],
  });

  const payload = extractJsonPayload(completion.reply);
  const content = normalizeWordResult(payload, prompt, completion.reply);
  const fileName = `${sanitizeFileNameSegment(content.title, 'AI文档初稿')}-${createTimestamp()}.docx`;
  const buffer = await createWordDocumentBuffer(content);
  const file = await saveGeneratedFile({
    buffer,
    originalName: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    user,
  });

  return {
    workflow: 'word',
    model: completion.model,
    file,
    preview: {
      title: content.title,
      summary: content.summary || '文档已生成，可直接进入预览页查看和继续编辑。',
      points: content.sections.slice(0, 4).map(section => section.heading),
      detailPoints: content.actionItems.slice(0, 4),
    },
    metrics: formatMetricMap([
      ['输出规模', scale],
      ['语言风格', language],
      ['附加结果', extra],
      ['参考文件', referenceDoc?.original_name || '未使用'],
      ['解析方式', referenceContext.mode === 'text_excerpt' ? '正文摘录' : referenceContext.mode === 'metadata_only' ? '元数据模式' : '无参考文件'],
    ]),
    context: normalizeReferenceContext(referenceDoc, referenceContext),
  };
}

function fallbackAnalysisResult(reply, prompt) {
  const points = normalizeTextList(reply, 12);
  return {
    title: sanitizeFileNameSegment(prompt || 'Excel分析报告', 'Excel分析报告'),
    summary: points[0] || cleanText(prompt) || '已根据当前输入生成分析结果。',
    highlights: points.slice(0, 5),
    risks: points.slice(5, 8),
    chartSuggestions: [],
    nextActions: [],
  };
}

function normalizeAnalysisResult(payload, prompt, reply) {
  if (!payload || typeof payload !== 'object') {
    return fallbackAnalysisResult(reply, prompt);
  }

  return {
    title: cleanText(payload.title) || sanitizeFileNameSegment(prompt || 'Excel分析报告', 'Excel分析报告'),
    summary: cleanText(payload.summary || payload.overview || payload.conclusion),
    highlights: normalizeTextList(payload.highlights || payload.findings || payload.keyFindings, 6),
    risks: normalizeTextList(payload.risks || payload.alerts || payload.issues, 4),
    chartSuggestions: normalizeTextList(payload.chartSuggestions || payload.charts || payload.visuals, 4),
    nextActions: normalizeTextList(payload.nextActions || payload.actions || payload.recommendations, 5),
  };
}

function createExcelSystemPrompt() {
  return [
    '你是一名企业数据分析助手，擅长解读 Excel、CSV 等业务数据并形成面向管理者的结论。',
    '请严格输出 JSON，不要输出 Markdown、解释或多余文字。',
    'JSON 结构如下：',
    '{',
    '  "title": "分析报告标题",',
    '  "summary": "整体结论，2-4 句",',
    '  "highlights": ["关键发现 1", "关键发现 2"],',
    '  "risks": ["风险点 1", "风险点 2"],',
    '  "chartSuggestions": ["适合制作的图表建议 1"],',
    '  "nextActions": ["后续建议 1", "后续建议 2"]',
    '}',
    '要求：',
    '1. 如果有表格摘要，优先基于字段、样例和数值列统计做分析。',
    '2. 结论要直给、可落地，适合经营分析、销售分析、财务复盘场景。',
    '3. 不要编造不存在的数据明细。',
  ].join('\n');
}

function buildExcelPrompt({ prompt, scale, language, extra, inputMode, referencePrompt }) {
  return [
    '任务类型：Excel 表格分析',
    `输入模式：${inputMode || 'upload'}`,
    `分析深度：${scale || '标准分析'}`,
    `输出口径：${language || '简体中文'}`,
    `附加结果：${extra || '结论 + 图表建议'}`,
    '',
    `用户问题：${prompt || '请基于当前表格做完整分析'}`,
    '',
    '参考上下文：',
    referencePrompt,
  ].join('\n');
}

async function generateExcelWorkflow({ prompt, scale, language, extra, inputMode, referenceDoc, user }) {
  const referenceContext = await buildReferenceContext(referenceDoc, 'spreadsheet');
  const completion = await createChatCompletion({
    systemPrompt: createExcelSystemPrompt(),
    messages: [{
      role: 'user',
      content: buildExcelPrompt({
        prompt,
        scale,
        language,
        extra,
        inputMode,
        referencePrompt: buildReferencePrompt(referenceDoc, referenceContext),
      }),
    }],
  });

  const payload = extractJsonPayload(completion.reply);
  const content = normalizeAnalysisResult(payload, prompt, completion.reply);
  const reportSections = [
    {
      heading: '数据概况',
      level: 1,
      paragraphs: [
        referenceDoc
          ? `本次分析基于文件《${referenceDoc.original_name}》生成。`
          : '本次分析基于用户提供的问题描述生成。',
        referenceContext.summaryText || '当前未解析到可直接引用的表格内容，以下结论更多依据用户输入与文件元数据。',
      ].filter(Boolean),
      bullets: [],
    },
    {
      heading: '核心发现',
      level: 1,
      paragraphs: [content.summary].filter(Boolean),
      bullets: content.highlights,
    },
    {
      heading: '风险提示',
      level: 1,
      paragraphs: [],
      bullets: content.risks,
    },
    {
      heading: '图表建议',
      level: 1,
      paragraphs: [],
      bullets: content.chartSuggestions,
    },
    {
      heading: '行动建议',
      level: 1,
      paragraphs: [],
      bullets: content.nextActions,
    },
  ].filter(section => section.paragraphs.length || section.bullets.length);

  const buffer = await createWordDocumentBuffer({
    title: content.title,
    subtitle: referenceDoc ? `来源：${referenceDoc.original_name}` : 'AI 自动生成分析报告',
    summary: content.summary,
    sections: reportSections,
    actionItems: [],
  });
  const fileName = `${sanitizeFileNameSegment(content.title || 'Excel分析报告', 'Excel分析报告')}-${createTimestamp()}.docx`;
  const file = await saveGeneratedFile({
    buffer,
    originalName: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    user,
  });

  return {
    workflow: 'excel',
    model: completion.model,
    file,
    preview: {
      title: content.title,
      summary: content.summary || '分析报告已生成，可在文档管理中查看。',
      points: content.highlights.slice(0, 5),
      detailPoints: [...content.risks.slice(0, 2), ...content.chartSuggestions.slice(0, 2)],
    },
    metrics: formatMetricMap([
      ['分析深度', scale],
      ['输出口径', language],
      ['附加结果', extra],
      ['参考文件', referenceDoc?.original_name || '未使用'],
      ['工作表', referenceContext.sheetName || '未识别'],
      ['数据规模', referenceContext.rowCount ? `${referenceContext.rowCount} 行 × ${referenceContext.columnCount} 列` : '未识别'],
    ]),
    context: normalizeReferenceContext(referenceDoc, referenceContext),
    dataset: referenceContext.mode === 'spreadsheet'
      ? {
          sheetName: referenceContext.sheetName,
          rowCount: referenceContext.rowCount,
          columnCount: referenceContext.columnCount,
          headers: referenceContext.headers.slice(0, 10),
        }
      : null,
  };
}

function fallbackPptResult(reply, prompt, slideTarget) {
  const blocks = normalizeWhitespace(reply)
    .split(/\n{2,}/)
    .map(block => block.split('\n').map(line => line.trim()).filter(Boolean))
    .filter(block => block.length)
    .slice(0, slideTarget);

  const slides = blocks.map((block, index) => ({
    title: block[0].replace(/^[#\d一二三四五六七八九十、.()（）]+/, '').trim() || `第 ${index + 1} 页`,
    bullets: block.slice(1).map(line => line.replace(/^[\-•]/, '').trim()).filter(Boolean).slice(0, 5),
    speakerNotes: '',
  }));

  if (!slides.length) {
    slides.push({
      title: sanitizeFileNameSegment(prompt, '生成汇报'),
      bullets: normalizeTextList(reply, 5),
      speakerNotes: '',
    });
  }

  return {
    title: sanitizeFileNameSegment(prompt, 'AI 演示文稿'),
    subtitle: 'AI 自动生成演示结构',
    slides,
  };
}

function normalizePptResult(payload, prompt, reply, slideTarget) {
  if (!payload || typeof payload !== 'object') {
    return fallbackPptResult(reply, prompt, slideTarget);
  }

  const slides = ensureArray(payload.slides)
    .map((slide, index) => ({
      title: cleanText(slide?.title || slide?.heading || `第 ${index + 1} 页`),
      bullets: normalizeTextList(slide?.bullets || slide?.points || slide?.content, 6),
      speakerNotes: cleanText(slide?.speakerNotes || slide?.notes),
    }))
    .filter(slide => slide.title || slide.bullets.length)
    .slice(0, slideTarget + 2);

  return {
    title: cleanText(payload.title) || sanitizeFileNameSegment(prompt, 'AI 演示文稿'),
    subtitle: cleanText(payload.subtitle || payload.coverNote || payload.summary),
    slides: slides.length ? slides : fallbackPptResult(reply, prompt, slideTarget).slides,
  };
}

function createPptSystemPrompt(slideTarget, template) {
  return [
    '你是一名中文汇报型 PPT 策划助手，擅长把 Word 文稿或项目描述重组为适合演示的逐页结构。',
    '请严格输出 JSON，不要输出 Markdown、解释或多余文字。',
    'JSON 结构如下：',
    '{',
    '  "title": "封面标题",',
    '  "subtitle": "封面副标题",',
    '  "slides": [',
    '    {',
    '      "title": "单页标题",',
    '      "bullets": ["本页要点 1", "本页要点 2"],',
    '      "speakerNotes": "演讲备注"',
    '    }',
    '  ]',
    '}',
    '要求：',
    `1. 目标页数接近 ${slideTarget} 页，允许略微浮动，但不要明显偏离。`,
    '2. 每页 bullets 维持 3-5 条，适合直接做页面文案。',
    `3. 当前模板气质：${template.description}`,
    '4. 逻辑上要先背景/目标，再方案/分析，最后结论/行动。',
  ].join('\n');
}

function buildPptPrompt({ prompt, scale, language, extra, inputMode, template, referencePrompt }) {
  return [
    '任务类型：Word 智能生成 PPT',
    `输入模式：${inputMode || 'generate'}`,
    `目标页数：${scale || '10-15 页'}`,
    `输出语言：${language || '简体中文'}`,
    `附加要求：${extra || '逐页文案'}`,
    `模板风格：${template.name} - ${template.description}`,
    '',
    `用户需求：${prompt || '请根据参考内容生成完整汇报型 PPT'}`,
    '',
    '参考上下文：',
    referencePrompt,
  ].join('\n');
}

function buildBulletTextRuns(items) {
  return items.map(item => ({
    text: item,
    options: {
      bullet: { indent: 18 },
      breakLine: true,
    },
  }));
}

function addPptFrame(slide, template, pageIndex) {
  slide.background = { color: template.background };
  slide.addShape('rect', {
    x: 0.45,
    y: 0.4,
    w: 12.4,
    h: 6.7,
    rectRadius: 0.08,
    line: { color: template.accentSoft, transparency: 60 },
    fill: { color: template.surface, transparency: 0 },
  });
  slide.addShape('rect', {
    x: 0.45,
    y: 0.4,
    w: 0.18,
    h: 6.7,
    line: { color: template.accent, transparency: 100 },
    fill: { color: template.accent },
  });
  slide.addText(String(pageIndex).padStart(2, '0'), {
    x: 11.8,
    y: 6.5,
    w: 0.7,
    h: 0.25,
    fontFace: 'Microsoft YaHei',
    fontSize: 10,
    color: template.muted,
    align: 'right',
  });
}

async function createPptBuffer(content, templateId) {
  const template = PPT_TEMPLATES[templateId] || PPT_TEMPLATES.biz;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'GD Document AI';
  pptx.subject = content.title;
  pptx.company = 'GD';
  pptx.lang = 'zh-CN';

  const cover = pptx.addSlide();
  cover.background = { color: template.background };
  cover.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.33,
    h: 7.5,
    line: { color: template.background, transparency: 100 },
    fill: { color: template.background },
  });
  cover.addShape('rect', {
    x: 0.7,
    y: 0.9,
    w: 1.25,
    h: 0.18,
    line: { color: template.accent, transparency: 100 },
    fill: { color: template.accent },
  });
  cover.addText(content.title, {
    x: 0.85,
    y: 1.45,
    w: 8.8,
    h: 1.3,
    fontFace: 'Microsoft YaHei',
    fontSize: 24,
    bold: true,
    color: template.text,
    margin: 0,
  });
  cover.addText(content.subtitle || `模板：${template.name}`, {
    x: 0.88,
    y: 2.95,
    w: 7.8,
    h: 0.6,
    fontFace: 'Microsoft YaHei',
    fontSize: 14,
    color: template.muted,
    margin: 0,
  });
  cover.addShape('roundRect', {
    x: 9.45,
    y: 1.15,
    w: 2.75,
    h: 4.7,
    rectRadius: 0.08,
    line: { color: template.accentSoft, transparency: 100 },
    fill: { color: template.accentSoft },
  });
  cover.addText(template.name, {
    x: 9.8,
    y: 1.55,
    w: 2,
    h: 0.35,
    fontFace: 'Microsoft YaHei',
    fontSize: 12,
    bold: true,
    color: template.accent,
    align: 'center',
  });
  cover.addText(`${content.slides.length} 页正文`, {
    x: 9.8,
    y: 2.1,
    w: 2,
    h: 0.3,
    fontFace: 'Microsoft YaHei',
    fontSize: 15,
    bold: true,
    color: template.text,
    align: 'center',
  });
  cover.addText(template.description, {
    x: 9.72,
    y: 2.75,
    w: 2.1,
    h: 1.45,
    fontFace: 'Microsoft YaHei',
    fontSize: 10,
    color: template.muted,
    align: 'center',
    valign: 'mid',
  });

  content.slides.forEach((slideContent, index) => {
    const slide = pptx.addSlide();
    addPptFrame(slide, template, index + 1);

    slide.addText(slideContent.title, {
      x: 1,
      y: 0.72,
      w: 7.2,
      h: 0.5,
      fontFace: 'Microsoft YaHei',
      fontSize: 22,
      bold: true,
      color: template.text,
      margin: 0,
    });
    slide.addText('核心要点', {
      x: 1.03,
      y: 1.28,
      w: 1.3,
      h: 0.25,
      fontFace: 'Microsoft YaHei',
      fontSize: 10,
      color: template.accent,
      bold: true,
      margin: 0,
    });
    slide.addShape('roundRect', {
      x: 0.95,
      y: 1.55,
      w: 7.15,
      h: 4.85,
      rectRadius: 0.04,
      line: { color: template.accentSoft, transparency: 100 },
      fill: { color: template.surface },
    });
    slide.addText(buildBulletTextRuns(slideContent.bullets), {
      x: 1.2,
      y: 1.95,
      w: 6.45,
      h: 3.95,
      fontFace: 'Microsoft YaHei',
      fontSize: 17,
      color: template.text,
      breakLine: true,
      margin: 0.05,
      valign: 'top',
    });
    slide.addShape('roundRect', {
      x: 8.55,
      y: 1.55,
      w: 3.15,
      h: 2.2,
      rectRadius: 0.05,
      line: { color: template.accent, transparency: 100 },
      fill: { color: template.accentSoft },
    });
    slide.addText('呈现建议', {
      x: 8.85,
      y: 1.85,
      w: 1.6,
      h: 0.22,
      fontFace: 'Microsoft YaHei',
      fontSize: 10,
      bold: true,
      color: template.accent,
      margin: 0,
    });
    slide.addText([
      { text: '先讲结论，再讲依据', options: { bullet: { indent: 14 }, breakLine: true } },
      { text: '保留一页一核心信息', options: { bullet: { indent: 14 }, breakLine: true } },
      { text: '适合继续补图表或流程图', options: { bullet: { indent: 14 }, breakLine: true } },
    ], {
      x: 8.82,
      y: 2.2,
      w: 2.45,
      h: 1.15,
      fontFace: 'Microsoft YaHei',
      fontSize: 11,
      color: template.text,
      margin: 0,
    });
    slide.addShape('roundRect', {
      x: 8.55,
      y: 4.05,
      w: 3.15,
      h: 2.35,
      rectRadius: 0.05,
      line: { color: template.accentSoft, transparency: 100 },
      fill: { color: template.surface },
    });
    slide.addText('备注', {
      x: 8.85,
      y: 4.32,
      w: 1,
      h: 0.2,
      fontFace: 'Microsoft YaHei',
      fontSize: 10,
      bold: true,
      color: template.muted,
      margin: 0,
    });
    slide.addText(slideContent.speakerNotes || '本页可在演讲时补充背景、案例或数据口径说明。', {
      x: 8.85,
      y: 4.65,
      w: 2.45,
      h: 1.35,
      fontFace: 'Microsoft YaHei',
      fontSize: 11,
      color: template.muted,
      margin: 0,
      fit: 'shrink',
    });
    if (slideContent.speakerNotes) {
      slide.addNotes(slideContent.speakerNotes);
    }
  });

  const output = await pptx.write({ outputType: 'nodebuffer', compression: true });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

async function generatePptWorkflow({ prompt, scale, language, extra, inputMode, referenceDoc, templateId, user }) {
  const slideTarget = extractTargetSize(scale, 12);
  const template = PPT_TEMPLATES[templateId] || PPT_TEMPLATES.biz;
  const referenceContext = await buildReferenceContext(referenceDoc, 'text');
  const completion = await createChatCompletion({
    systemPrompt: createPptSystemPrompt(slideTarget, template),
    messages: [{
      role: 'user',
      content: buildPptPrompt({
        prompt,
        scale,
        language,
        extra,
        inputMode,
        template,
        referencePrompt: buildReferencePrompt(referenceDoc, referenceContext),
      }),
    }],
  });

  const payload = extractJsonPayload(completion.reply);
  const content = normalizePptResult(payload, prompt, completion.reply, slideTarget);
  const fileName = `${sanitizeFileNameSegment(content.title, 'AI演示文稿')}-${createTimestamp()}.pptx`;
  const buffer = await createPptBuffer(content, templateId);
  const file = await saveGeneratedFile({
    buffer,
    originalName: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    user,
  });

  return {
    workflow: 'ppt',
    model: completion.model,
    file,
    preview: {
      title: content.title,
      summary: content.subtitle || '演示文稿已生成，可直接进入预览页查看每一页内容。',
      points: content.slides.slice(0, 6).map(slide => slide.title),
      detailPoints: content.slides[0]?.bullets?.slice(0, 4) || [],
    },
    metrics: formatMetricMap([
      ['目标页数', scale],
      ['输出语言', language],
      ['附加结果', extra],
      ['PPT 模板', template.name],
      ['实际页数', `${content.slides.length + 1} 页（含封面）`],
      ['参考文件', referenceDoc?.original_name || '未使用'],
    ]),
    context: normalizeReferenceContext(referenceDoc, referenceContext),
  };
}

module.exports = {
  PPT_TEMPLATES,
  generateExcelWorkflow,
  generatePptWorkflow,
  generateWordWorkflow,
};
