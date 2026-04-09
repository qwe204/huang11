const express = require('express');
const config = require('../config');
const { getFileByIdForUser, logOperation } = require('../services/fileService');
const { createChatCompletion, getStatus } = require('../services/aiService');
const { createSystemPrompt, normalizeChatMessages, readTextExcerpt } = require('../services/documentAiService');
const {
  generateExcelWorkflow,
  generatePptWorkflow,
  generateWordWorkflow,
} = require('../services/aiWorkflowService');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/status', async (_req, res) => {
  try {
    const status = await getStatus();

    res.json({
      code: 0,
      message: 'ok',
      data: status,
    });
  } catch (err) {
    logger.error('Get AI status failed:', err);
    res.status(500).json({
      code: 5000,
      message: err.message || '获取 AI 状态失败',
      data: {
        available: false,
        provider: config.ai.provider,
        baseUrl: config.ai.baseUrl,
        model: config.ai.model || '',
        models: [],
      },
    });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { fileId, messages } = req.body || {};

    if (!fileId) {
      return res.status(400).json({ code: 4001, message: '缺少 fileId' });
    }

    const doc = getFileByIdForUser(fileId, req.user);
    if (!doc) {
      return res.status(404).json({ code: 4040, message: '文件不存在' });
    }

    const normalizedMessages = normalizeChatMessages(messages);
    const latestUserMessage = [...normalizedMessages].reverse().find(message => message.role === 'user');

    if (!latestUserMessage) {
      return res.status(400).json({ code: 4001, message: '缺少用户提问内容' });
    }

    const context = readTextExcerpt(doc);
    const systemPrompt = createSystemPrompt(doc, context);
    const completion = await createChatCompletion({
      messages: normalizedMessages,
      systemPrompt,
    });

    res.json({
      code: 0,
      message: 'ok',
      data: {
        reply: completion.reply,
        model: completion.model,
        context: {
          mode: context.mode,
          warning: context.warning,
          hasExtractedText: context.mode === 'text_excerpt',
        },
      },
    });
  } catch (err) {
    logger.error('Document AI chat failed:', err);
    res.status(500).json({ code: 5000, message: err.message || '文档 AI 对话失败' });
  }
});

router.post('/workflows/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const {
      prompt = '',
      scale = '',
      language = '',
      extra = '',
      inputMode = 'generate',
      referenceFileId = '',
      templateId = 'biz',
    } = req.body || {};

    let referenceDoc = null;
    if (referenceFileId) {
      referenceDoc = getFileByIdForUser(referenceFileId, req.user);
      if (!referenceDoc) {
        return res.status(404).json({ code: 4040, message: '参考文件不存在或无权访问' });
      }
    }

    if (!prompt.trim() && !referenceDoc) {
      return res.status(400).json({ code: 4001, message: '请输入任务说明或上传参考文件' });
    }

    let result = null;
    if (type === 'word') {
      result = await generateWordWorkflow({
        prompt,
        scale,
        language,
        extra,
        inputMode,
        referenceDoc,
        user: req.user,
      });
    } else if (type === 'excel') {
      result = await generateExcelWorkflow({
        prompt,
        scale,
        language,
        extra,
        inputMode,
        referenceDoc,
        user: req.user,
      });
    } else if (type === 'ppt') {
      result = await generatePptWorkflow({
        prompt,
        scale,
        language,
        extra,
        inputMode,
        referenceDoc,
        templateId,
        user: req.user,
      });
    } else {
      return res.status(400).json({ code: 4001, message: '不支持的 AI 工作流类型' });
    }

    if (result?.file?.id) {
      logOperation(
        result.file.id,
        `ai_${type}`,
        `AI 工作流生成文件: ${result.file.original_name || result.file.originalName || result.file.id}`,
        req.ip,
        req.user?.id || null
      );
    }

    res.json({
      code: 0,
      message: 'ok',
      data: result,
    });
  } catch (err) {
    logger.error('AI workflow failed:', err);
    res.status(500).json({ code: 5000, message: err.message || 'AI 工作流执行失败' });
  }
});

module.exports = router;
