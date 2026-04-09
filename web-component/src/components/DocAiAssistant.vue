<template>
  <div class="doc-ai-assistant">
    <div class="assistant-header">
      <div class="assistant-heading">
        <div class="assistant-badge">
          <el-icon><ChatDotRound /></el-icon>
        </div>
        <div>
          <div class="assistant-title">文档 AI 助手</div>
          <div class="assistant-subtitle">围绕当前文档提供快捷提问入口</div>
        </div>
      </div>

      <el-button text size="small" @click="emit('close')">
        <el-icon><Close /></el-icon>
      </el-button>
    </div>

    <div ref="scrollContainer" class="assistant-body">
      <section class="context-card">
        <div class="context-label">当前文档</div>
        <div class="context-name">{{ file.original_name }}</div>
        <div class="model-status" :class="{ offline: !assistantReady }">
          {{ modelStatusText }}
        </div>
        <div class="context-meta">
          <span>{{ typeLabel }}</span>
          <span>v{{ file.version }}</span>
          <span>{{ formattedUpdatedAt }}</span>
        </div>
      </section>

      <section v-if="contextWarning" class="context-warning">
        {{ contextWarning }}
      </section>

      <section class="quick-actions">
        <div class="section-title">快捷提问</div>
        <div class="quick-action-list">
          <button
            v-for="action in quickActions"
            :key="action"
            type="button"
            class="quick-action-chip"
            @click="useQuickAction(action)"
          >
            {{ action }}
          </button>
        </div>
      </section>

      <section class="message-list">
        <div
          v-for="message in messages"
          :key="message.id"
          class="message-item"
          :class="`role-${message.role}`"
        >
          <div class="message-role">
            {{ message.role === 'assistant' ? 'AI 助手' : '你' }}
          </div>
          <div class="message-bubble">
            {{ message.content }}
          </div>
        </div>

        <div v-if="assistantThinking" class="message-item role-assistant">
          <div class="message-role">AI 助手</div>
          <div class="message-bubble thinking-bubble">
            <span class="thinking-dot" />
            <span class="thinking-dot" />
            <span class="thinking-dot" />
          </div>
        </div>
      </section>
    </div>

    <div class="assistant-footer">
      <el-input
        v-model="draftMessage"
        type="textarea"
        :rows="3"
        resize="none"
        placeholder="输入你想针对当前文档咨询的问题"
        @keydown.enter.exact.prevent="handleSubmit"
      />
      <div class="assistant-footer-bar">
        <span class="footer-hint">Enter 发送，Shift + Enter 换行</span>
        <el-button
          type="primary"
          :disabled="assistantThinking || !draftMessage.trim()"
          @click="handleSubmit"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'DocAiAssistant',
}
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ChatDotRound, Close } from '@element-plus/icons-vue'
import { assistantApi } from '../services/api'
import type {
  AssistantChatMessage,
  AssistantStatusResponse,
  FileInfo,
} from '../services/api'

type AssistantMessage = {
  id: number
  role: 'assistant' | 'user'
  content: string
  transient?: boolean
}

const props = defineProps<{
  file: FileInfo
}>()

const emit = defineEmits<{
  close: []
}>()

const scrollContainer = ref<HTMLElement>()
const draftMessage = ref('')
const assistantThinking = ref(false)
const messages = ref<AssistantMessage[]>([])
const assistantStatus = ref<AssistantStatusResponse | null>(null)
const assistantStatusError = ref('')
const contextWarning = ref('')

let messageSeed = 0

const typeLabel = computed(() => {
  const typeMap: Record<string, string> = {
    word: 'Word 文档',
    cell: 'Excel 表格',
    slide: 'PPT 演示',
    pdf: 'PDF 文档',
  }

  return typeMap[props.file.document_type] || '通用文档'
})

const quickActions = computed(() => {
  if (props.file.document_type === 'cell') {
    return ['总结这个表格', '列出关键指标', '帮我梳理异常点', '整理汇报口径']
  }

  if (props.file.document_type === 'slide') {
    return ['概括演示内容', '生成汇报提纲', '提炼重点页面', '列出可追问的问题']
  }

  return ['总结这份文档', '提炼关键信息', '列出风险点', '生成汇报提纲']
})

const formattedUpdatedAt = computed(() => {
  if (!props.file.updated_at) return '最近更新未知'
  return props.file.updated_at.replace('T', ' ').slice(0, 16)
})

const assistantReady = computed(() => !!assistantStatus.value?.available)

const modelStatusText = computed(() => {
  if (assistantStatus.value?.available) {
    return `已连接本地模型：${assistantStatus.value.model}`
  }

  if (assistantStatusError.value) {
    return `模型连接异常：${assistantStatusError.value}`
  }

  return '正在检查本地模型状态...'
})

function createMessage(role: AssistantMessage['role'], content: string, transient = false) {
  messageSeed += 1
  return {
    id: messageSeed,
    role,
    content,
    transient,
  }
}

function buildWelcomeMessage() {
  if (assistantStatus.value?.available) {
    return `我是文档 AI 助手，已关联《${props.file.original_name}》，当前使用模型 ${assistantStatus.value.model}。你可以让我总结文档、提炼重点、列出风险或生成汇报提纲。`
  }

  return `我是文档 AI 助手，已关联《${props.file.original_name}》。当前还没有成功连接到本地 LM Studio 模型，你仍然可以尝试提问，我会在请求失败时给出明确提示。`
}

function scrollToBottom() {
  nextTick(() => {
    const el = scrollContainer.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  })
}

function buildChatHistory(): AssistantChatMessage[] {
  return messages.value
    .filter(message => !message.transient)
    .map(({ role, content }) => ({ role, content }))
}

async function loadAssistantStatus() {
  assistantStatusError.value = ''

  try {
    const res = await assistantApi.getStatus()
    assistantStatus.value = res.data
  } catch (err: any) {
    assistantStatus.value = null
    assistantStatusError.value = err.message || '无法连接本地模型'
  }
}

async function resetConversation() {
  draftMessage.value = ''
  assistantThinking.value = false
  contextWarning.value = ''
  await loadAssistantStatus()
  messages.value = [createMessage('assistant', buildWelcomeMessage(), true)]
  scrollToBottom()
}

function useQuickAction(action: string) {
  draftMessage.value = action
  handleSubmit()
}

async function handleSubmit() {
  const prompt = draftMessage.value.trim()
  if (!prompt || assistantThinking.value) return

  messages.value.push(createMessage('user', prompt))
  draftMessage.value = ''
  assistantThinking.value = true
  scrollToBottom()

  try {
    const res = await assistantApi.chat(props.file.id, buildChatHistory())
    contextWarning.value = res.data.context?.warning || ''
    messages.value.push(createMessage('assistant', res.data.reply))
  } catch (err: any) {
    const errorMessage = err.message || '文档 AI 请求失败'
    ElMessage.error(errorMessage)
    messages.value.push(createMessage('assistant', `当前无法从本地模型获取回答：${errorMessage}`))
  } finally {
    assistantThinking.value = false
    scrollToBottom()
  }
}

watch(() => props.file.id, () => {
  void resetConversation()
}, { immediate: true })
</script>

<style scoped>
.doc-ai-assistant {
  height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top right, rgba(13, 148, 136, 0.08), transparent 34%),
    linear-gradient(180deg, #fbfefd 0%, #ffffff 100%);
}

.assistant-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--dp-border-light);
}

.assistant-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.assistant-badge {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--dp-primary), var(--dp-info));
  box-shadow: 0 10px 22px rgba(13, 148, 136, 0.18);
}

.assistant-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--dp-text);
}

.assistant-subtitle {
  font-size: 12px;
  color: var(--dp-text-muted);
  margin-top: 3px;
}

.assistant-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
}

.context-card {
  padding: 16px;
  border-radius: var(--dp-radius-lg);
  border: 1px solid rgba(13, 148, 136, 0.14);
  background: rgba(13, 148, 136, 0.05);
  box-shadow: var(--dp-shadow-sm);
}

.context-label,
.section-title,
.message-role,
.footer-hint {
  font-size: 12px;
}

.context-label,
.section-title,
.message-role {
  color: var(--dp-text-muted);
}

.context-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--dp-text);
  margin-top: 6px;
  line-height: 1.5;
  word-break: break-word;
}

.model-status {
  margin-top: 10px;
  font-size: 12px;
  color: var(--dp-primary-dark);
}

.model-status.offline {
  color: var(--dp-warning);
}

.context-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.context-meta span {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  color: var(--dp-text-secondary);
  font-size: 12px;
}

.context-warning {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--dp-radius-md);
  background: rgba(202, 138, 4, 0.08);
  color: #8a5a00;
  font-size: 12px;
  line-height: 1.6;
}

.quick-actions {
  margin-top: 18px;
}

.quick-action-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.quick-action-chip {
  border: none;
  cursor: pointer;
  border-radius: 999px;
  padding: 9px 12px;
  font-size: 12px;
  color: var(--dp-text);
  background: #ffffff;
  box-shadow: inset 0 0 0 1px var(--dp-border);
  transition: transform var(--dp-transition), box-shadow var(--dp-transition), background var(--dp-transition);
}

.quick-action-chip:hover {
  transform: translateY(-1px);
  background: rgba(13, 148, 136, 0.06);
  box-shadow: inset 0 0 0 1px rgba(13, 148, 136, 0.3);
}

.message-list {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.message-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-bubble {
  max-width: 100%;
  padding: 12px 14px;
  border-radius: 16px;
  line-height: 1.65;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: var(--dp-shadow-sm);
}

.role-assistant .message-bubble {
  background: #ffffff;
  border-top-left-radius: 6px;
  color: var(--dp-text);
}

.role-user {
  align-items: flex-end;
}

.role-user .message-role {
  text-align: right;
}

.role-user .message-bubble {
  background: linear-gradient(135deg, var(--dp-primary), var(--dp-primary-light));
  color: #ffffff;
  border-top-right-radius: 6px;
}

.thinking-bubble {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
}

.thinking-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dp-text-muted);
  animation: blink 1.2s infinite;
}

.thinking-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.thinking-dot:nth-child(3) {
  animation-delay: 0.3s;
}

.assistant-footer {
  padding: 16px 18px 18px;
  border-top: 1px solid var(--dp-border-light);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
}

.assistant-footer-bar {
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.footer-hint {
  color: var(--dp-text-muted);
}

@keyframes blink {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (max-width: 768px) {
  .assistant-body,
  .assistant-footer,
  .assistant-header {
    padding-left: 14px;
    padding-right: 14px;
  }

  .assistant-footer-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
