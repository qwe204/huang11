<template>
  <div class="doc-viewer">
    <div class="viewer-toolbar">
      <div class="toolbar-left">
        <el-button text @click="emit('back')">
          <el-icon style="margin-right: 4px"><ArrowLeft /></el-icon>
          返回
        </el-button>
        <el-divider direction="vertical" />
        <span class="file-title">{{ file.original_name }}</span>
        <el-tag size="small" effect="plain" type="info">v{{ file.version }}</el-tag>
      </div>

      <div class="toolbar-center">
        <div class="zoom-controls">
          <el-button-group>
            <el-tooltip content="缩小 (Ctrl+-)" placement="bottom">
              <el-button size="small" :icon="ZoomOut" :disabled="!canZoomOut" @click="zoomOut" />
            </el-tooltip>
            <el-dropdown trigger="click" @command="setZoom">
              <el-button size="small" class="zoom-display">{{ zoomDisplayLabel }}</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="z in zoomPresets" :key="z" :command="z">
                    {{ z }}%
                  </el-dropdown-item>
                  <el-dropdown-item divided command="fit-width">适应宽度</el-dropdown-item>
                  <el-dropdown-item command="fit-page">适应页面</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-tooltip content="放大 (Ctrl+=)" placement="bottom">
              <el-button size="small" :icon="ZoomIn" :disabled="!canZoomIn" @click="zoomIn" />
            </el-tooltip>
          </el-button-group>
        </div>
      </div>

      <div class="toolbar-right">
        <el-tooltip :content="editorMode === 'view' ? '切换到编辑模式' : '切换到预览模式'" placement="bottom">
          <el-button
            size="small"
            :type="editorMode === 'edit' ? 'primary' : 'default'"
            @click="toggleMode"
          >
            <el-icon style="margin-right: 4px">
              <Edit v-if="editorMode === 'view'" />
              <View v-else />
            </el-icon>
            {{ editorMode === 'view' ? '编辑' : '预览' }}
          </el-button>
        </el-tooltip>

        <el-tooltip content="显示缩略图侧栏" placement="bottom">
          <el-button size="small" :type="showThumbnail ? 'primary' : 'default'" @click="showThumbnail = !showThumbnail">
            <el-icon><Grid /></el-icon>
          </el-button>
        </el-tooltip>

        <el-tooltip :content="showAssistant ? '关闭 AI 助手' : '打开 AI 助手'" placement="bottom">
          <el-button size="small" :type="showAssistant ? 'primary' : 'default'" @click="showAssistant = !showAssistant">
            <el-icon style="margin-right: 4px"><ChatDotRound /></el-icon>
            AI 助手
          </el-button>
        </el-tooltip>

        <el-tooltip content="下载文档" placement="bottom">
          <el-button size="small" @click="handleDownload">
            <el-icon><Download /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="viewer-content">
      <transition name="slide">
        <div v-if="showThumbnail" class="thumbnail-sidebar">
          <div class="sidebar-header">
            <span>页面缩略图</span>
            <el-button text size="small" @click="showThumbnail = false">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <div class="thumbnail-list">
            <div
              v-for="(thumb, index) in thumbnails"
              :key="index"
              class="thumbnail-item"
              :class="{ active: currentPage === index + 1 }"
              @click="goToPage(index + 1)"
            >
              <div class="thumb-preview">
                <div class="thumb-placeholder">{{ index + 1 }}</div>
              </div>
              <span class="thumb-label">第 {{ index + 1 }} 页</span>
            </div>
          </div>
        </div>
      </transition>

      <div class="editor-wrapper">
        <div id="onlyoffice-editor" class="editor-container"></div>
      </div>

      <transition name="assistant-fab">
        <button
          v-if="!showAssistant"
          type="button"
          class="assistant-fab"
          @click="showAssistant = true"
        >
          <el-icon><ChatDotRound /></el-icon>
          <span>AI 助手</span>
        </button>
      </transition>

      <transition name="assistant-slide">
        <aside v-if="showAssistant" class="assistant-sidebar">
          <DocAiAssistant :file="file" @close="showAssistant = false" />
        </aside>
      </transition>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'DocViewer',
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  ChatDotRound,
  Close,
  Download,
  Edit,
  Grid,
  View,
  ZoomIn,
  ZoomOut,
} from '@element-plus/icons-vue'
import { fileApi } from '../services/api'
import type { EditorZoomValue, FileInfo } from '../services/api'
import DocAiAssistant from './DocAiAssistant.vue'

type OnlyOfficeWindow = Window & {
  DocsAPI?: {
    DocEditor: new (id: string, config: any) => any
  }
}

type ZoomMode = 'percent' | 'fit-width' | 'fit-page'

const props = defineProps<{
  file: FileInfo
}>()

const emit = defineEmits<{
  back: []
}>()

const editorMode = ref<'view' | 'edit'>('view')
const zoomLevel = ref(100)
const zoomMode = ref<ZoomMode>('percent')
const showThumbnail = ref(false)
const showAssistant = ref(false)
const currentPage = ref(1)
const zoomPresets = [50, 75, 100, 125, 150, 200, 300]
const zoomDisplayLabel = computed(() => {
  if (zoomMode.value === 'fit-width') return '适宽'
  if (zoomMode.value === 'fit-page') return '整页'
  return `${zoomLevel.value}%`
})
const canZoomOut = computed(() => zoomPresets.some(value => value < zoomLevel.value))
const canZoomIn = computed(() => zoomPresets.some(value => value > zoomLevel.value))

let editorInstance: any = null
let initSequence = 0
const onlyOfficeWindow = window as OnlyOfficeWindow

const thumbnails = ref<{ page: number }[]>([])

function generateThumbnails(pageCount: number) {
  thumbnails.value = Array.from({ length: pageCount }, (_, index) => ({ page: index + 1 }))
}

function getZoomValue(): EditorZoomValue {
  return zoomMode.value === 'percent' ? zoomLevel.value : zoomMode.value
}

async function initEditor(options: { silentReady?: boolean } = {}) {
  const { silentReady = false } = options
  const initId = ++initSequence

  try {
    const res = await fileApi.getEditorConfig(props.file.id, editorMode.value, getZoomValue())
    const { config, apiUrl } = res.data

    if (initId !== initSequence) return

    await loadOnlyOfficeScript(apiUrl)

    if (initId !== initSequence) return

    if (editorInstance) {
      editorInstance.destroyEditor()
      editorInstance = null
    }

    const editorEl = document.getElementById('onlyoffice-editor')
    if (editorEl) editorEl.innerHTML = ''

    config.height = '100%'
    config.width = '100%'
    config.events = {
      onReady: () => {
        if (!silentReady) {
          ElMessage.success('文档加载完成')
        }
      },
      onDocumentReady: () => {
        generateThumbnails(20)
      },
      onError: (event: any) => {
        ElMessage.error(`文档加载失败: ${event?.data?.errorDescription || '未知错误'}`)
      },
    }

    editorInstance = new onlyOfficeWindow.DocsAPI!.DocEditor('onlyoffice-editor', config)
  } catch (err: any) {
    if (initId !== initSequence) return
    ElMessage.error(`初始化编辑器失败: ${err.message}`)
  }
}

function loadOnlyOfficeScript(apiUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (onlyOfficeWindow.DocsAPI) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = apiUrl
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('无法加载 OnlyOffice API'))
    document.head.appendChild(script)
  })
}

function zoomIn() {
  const next = zoomPresets.find(value => value > zoomLevel.value)
  if (next) setZoom(next)
}

function zoomOut() {
  const prev = [...zoomPresets].reverse().find(value => value < zoomLevel.value)
  if (prev) setZoom(prev)
}

function setZoom(level: number | 'fit-width' | 'fit-page') {
  if (level === 'fit-width' || level === 'fit-page') {
    if (zoomMode.value === level) return

    zoomMode.value = level
    void initEditor({ silentReady: true })
    return
  }

  if (zoomMode.value === 'percent' && zoomLevel.value === level) return

  zoomMode.value = 'percent'
  zoomLevel.value = level
  void initEditor({ silentReady: true })
}

function goToPage(page: number) {
  currentPage.value = page

  if (editorInstance) {
    try {
      editorInstance.serviceCommand('goToPage', { page: page - 1 })
    } catch {
      // Some OnlyOffice builds do not expose page navigation commands.
    }
  }
}

function toggleMode() {
  editorMode.value = editorMode.value === 'view' ? 'edit' : 'view'
}

function handleDownload() {
  const url = fileApi.getDownloadUrl(props.file.id)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = props.file.original_name
  anchor.click()
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && (event.key === '=' || event.key === '+')) {
    event.preventDefault()
    zoomIn()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key === '-') {
    event.preventDefault()
    zoomOut()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key === '0') {
    event.preventDefault()
    setZoom(100)
  }
}

watch(editorMode, () => {
  void initEditor()
})

watch(() => props.file.id, () => {
  currentPage.value = 1
  showThumbnail.value = false
  showAssistant.value = false
  zoomLevel.value = 100
  zoomMode.value = 'percent'
  void initEditor()
})

onMounted(() => {
  void initEditor()
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)

  if (editorInstance) {
    try {
      editorInstance.destroyEditor()
    } catch {}

    editorInstance = null
  }
})
</script>

<style scoped>
.doc-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 10px;
}

.viewer-toolbar {
  height: var(--dp-toolbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-radius: var(--dp-radius-md);
  border: 1px solid var(--dp-border-light);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfc 100%);
  box-shadow: var(--dp-shadow-sm);
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--dp-text);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zoom-controls {
  display: flex;
  align-items: center;
}

.zoom-display {
  min-width: 60px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.viewer-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  border-radius: var(--dp-radius-md);
  border: 1px solid var(--dp-border-light);
  box-shadow: var(--dp-shadow-sm);
  background:
    radial-gradient(circle at top left, rgba(15, 118, 110, 0.11), transparent 24%),
    radial-gradient(circle at right top, rgba(56, 189, 248, 0.08), transparent 28%),
    linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.thumbnail-sidebar {
  width: var(--dp-sidebar-width);
  border-right: 1px solid var(--dp-border);
  background: linear-gradient(180deg, #f9fcff 0%, #f4f8fc 100%);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dp-text-secondary);
  border-bottom: 1px solid var(--dp-border-light);
}

.thumbnail-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.thumbnail-item {
  padding: 9px;
  border-radius: var(--dp-radius-sm);
  cursor: pointer;
  text-align: center;
  transition: background var(--dp-transition);
  margin-bottom: 4px;
}

.thumbnail-item:hover {
  background: var(--dp-bg-hover);
  transform: translateY(-1px);
}

.thumbnail-item.active {
  background: rgba(13, 148, 136, 0.08);
  outline: 2px solid var(--dp-primary);
  outline-offset: -2px;
  border-radius: var(--dp-radius-sm);
}

.thumb-preview {
  width: 100%;
  aspect-ratio: 210 / 297;
  background: #fff;
  border: 1px solid var(--dp-border);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--dp-shadow-sm);
}

.thumb-placeholder {
  font-size: 20px;
  font-weight: 700;
  color: var(--dp-text-muted);
}

.thumb-label {
  font-size: 11px;
  color: var(--dp-text-muted);
  margin-top: 4px;
  display: block;
}

.editor-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  min-width: 0;
}

.editor-container {
  width: 100%;
  height: 100%;
}

.assistant-fab {
  position: absolute;
  top: 50%;
  right: 18px;
  transform: translateY(-50%);
  height: 46px;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--dp-primary), var(--dp-info));
  color: #fff;
  cursor: pointer;
  box-shadow: 0 14px 32px rgba(13, 148, 136, 0.24);
  z-index: 15;
  transition: transform var(--dp-transition), box-shadow var(--dp-transition);
}

.assistant-fab:hover {
  transform: translateY(-50%) translateX(-2px);
  box-shadow: 0 18px 40px rgba(13, 148, 136, 0.3);
}

.assistant-sidebar {
  width: min(380px, 32vw);
  min-width: 320px;
  height: 100%;
  flex-shrink: 0;
  border-left: 1px solid var(--dp-border);
  background: #ffffff;
}

.slide-enter-active,
.slide-leave-active {
  transition: width 0.2s ease, opacity 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  width: 0;
  opacity: 0;
}

.assistant-slide-enter-active,
.assistant-slide-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.assistant-slide-enter-from,
.assistant-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.assistant-fab-enter-active,
.assistant-fab-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.assistant-fab-enter-from,
.assistant-fab-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(12px);
}

@media (max-width: 1200px) {
  .assistant-sidebar {
    position: absolute;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: min(360px, calc(100% - 24px));
    min-width: 0;
    border: 1px solid var(--dp-border);
    border-radius: var(--dp-radius-lg);
    box-shadow: var(--dp-shadow-lg);
    overflow: hidden;
    z-index: 20;
  }
}

@media (max-width: 768px) {
  .doc-viewer {
    padding: 8px;
    gap: 8px;
  }

  .viewer-toolbar {
    padding: 0 10px;
    gap: 8px;
  }

  .toolbar-left,
  .toolbar-center,
  .toolbar-right {
    min-width: 0;
  }

  .toolbar-left {
    flex: 1;
  }

  .file-title {
    max-width: 120px;
  }

  .toolbar-center {
    display: none;
  }

  .assistant-fab {
    top: auto;
    right: 14px;
    bottom: 16px;
    transform: none;
  }

  .assistant-fab:hover {
    transform: translateY(-2px);
  }
}
</style>
