const config = require('../config');

let cachedModels = [];
let cachedAt = 0;

const MODEL_CACHE_TTL = 30 * 1000;

function getBaseUrl() {
  return config.ai.baseUrl.replace(/\/+$/, '');
}

function getAuthHeaders() {
  if (!config.ai.apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${config.ai.apiKey}`,
  };
}

function normalizeAssistantContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item?.type === 'text') return item.text || '';
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

async function requestJson(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = data?.error?.message || data?.message || `AI 服务请求失败 (${response.status})`;
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('AI 服务请求超时');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function filterChatModels(models) {
  return models.filter(modelId => !/embedding|embed|rerank/i.test(modelId));
}

async function listModels(force = false) {
  const now = Date.now();

  if (!force && cachedModels.length && now - cachedAt < MODEL_CACHE_TTL) {
    return cachedModels;
  }

  const data = await requestJson('/models', {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  cachedModels = (data?.data || [])
    .map(item => item?.id)
    .filter(Boolean);
  cachedAt = now;

  return cachedModels;
}

async function resolveModel() {
  if (config.ai.model) {
    return config.ai.model;
  }

  const models = await listModels();
  const chatModels = filterChatModels(models);

  if (chatModels.length) {
    return chatModels[0];
  }

  if (models.length) {
    return models[0];
  }

  throw new Error('LM Studio 未发现可用模型，请先在本地加载模型');
}

async function getStatus() {
  const models = await listModels();
  const selectedModel = await resolveModel();

  return {
    available: true,
    provider: config.ai.provider,
    baseUrl: getBaseUrl(),
    model: selectedModel,
    models,
  };
}

async function createChatCompletion({ messages, systemPrompt }) {
  const model = await resolveModel();
  const payload = {
    model,
    stream: false,
    temperature: config.ai.temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };

  const data = await requestJson('/chat/completions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const reply = normalizeAssistantContent(data?.choices?.[0]?.message?.content);

  if (!reply) {
    throw new Error('未返回有效回答');
  }

  return {
    reply,
    model,
    raw: data,
  };
}

module.exports = {
  createChatCompletion,
  getStatus,
  listModels,
  resolveModel,
};
