<template>
  <div class="doc-preview-element" :style="{ width: width, height: height }">
    <template v-if="mode === 'upload' && !currentFile">
      <div class="upload-zone" @drop.prevent="handleDrop" @dragover.prevent="dragActive = true" @dragleave="dragActive = false" :class="{ 'drag-active': dragActive }">
        <div class="upload-content">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p class="upload-title">拖拽文件到此处，或点击选择文件</p>
          <p class="upload-hint">支持 Word、Excel、PPT、PDF、WPS 等格式，最大 200MB</p>
          <el-button type="primary" @click="triggerFileInput" style="margin-top: 16px">选择文件</el-button>
          <input ref="fileInput" type="file" :accept="acceptTypes" style="display:none" @change="handleFileSelect" />
        </div>
        <el-progress v-if="uploading" :percentage="uploadPercent" style="width: 60%; margin-top: 16px" />
      </div>
    </template>

    <template v-else-if="currentFile">
      <div class="embedded-viewer">
        <div class="embedded-toolbar" v-if="showToolbar">
          <span class="embedded-title">{{ currentFile.original_name }}</span>
          <div class="embedded-actions">
            <el-button-group size="small">
              <el-button @click="embeddedZoomOut" :disabled="embeddedZoom <= 50">-</el-button>
              <el-button class="zoom-display">{{ embeddedZoom }}%</el-button>
              <el-button @click="embeddedZoomIn" :disabled="embeddedZoom >= 300">+</el-button>
            </el-button-group>
            <el-button size="small" :type="embeddedMode === 'edit' ? 'primary' : 'default'" @click="toggleEmbeddedMode">
              {{ embeddedMode === 'view' ? '编辑' : '预览' }}
            </el-button>
            <el-button size="small" @click="downloadFile">下载</el-button>
            <el-button v-if="mode === 'upload'" size="small" @click="currentFile = null">关闭</el-button>
          </div>
        </div>
        <div id="embedded-editor" class="embedded-editor-area"></div>
        <div v-if="editorLoading" class="embedded-loading">
          <el-icon class="loading-spin"><Loading /></el-icon>
          <span>加载中...</span>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="no-file">
        <p>未指定文档</p>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
export default {
  name: 'DocPreviewElement',
}
</script>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { fileApi } from '../services/api'
import type { FileInfo } from '../services/api'

type OnlyOfficeWindow = Window & {
  DocsAPI?: {
    DocEditor: new (id: string, config: any) => any
  }
}

const props = withDefaults(defineProps<{
  src?: string
  serverUrl?: string
  uploadUrl?: string
  mode?: 'view' | 'edit' | 'upload'
  showToolbar?: boolean
  showThumbnail?: boolean
  width?: string
  height?: string
  locale?: string
}>(), {
  mode: 'upload',
  showToolbar: true,
  showThumbnail: false,
  width: '100%',
  height: '600px',
  locale: 'zh',
})

const emit = defineEmits<{
  'doc-loaded': [info: { fileName: string; fileType: string }]
  'upload-success': [info: { fileName: string; fileUrl: string }]
  'error': [info: { code: number; message: string }]
}>()

const currentFile = ref<FileInfo | null>(null)
const editorLoading = ref(false)
const uploading = ref(false)
const uploadPercent = ref(0)
const dragActive = ref(false)
const embeddedZoom = ref(100)
const embeddedMode = ref<'view' | 'edit'>(props.mode === 'edit' ? 'edit' : 'view')
const fileInput = ref<HTMLInputElement>()

const acceptTypes = '.docx,.doc,.xlsx,.xls,.pptx,.ppt,.pdf,.odt,.ods,.odp,.rtf,.txt,.csv,.wps,.et,.dps'

let editorInstance: any = null
const onlyOfficeWindow = window as OnlyOfficeWindow

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    await uploadFile(input.files[0])
    input.value = ''
  }
}

async function handleDrop(e: DragEvent) {
  dragActive.value = false
  const file = e.dataTransfer?.files[0]
  if (file) await uploadFile(file)
}

async function uploadFile(file: File) {
  uploading.value = true
  uploadPercent.value = 0
  try {
    const res = await fileApi.upload(file, (p) => { uploadPercent.value = p })
    currentFile.value = res.data as any
    emit('upload-success', { fileName: file.name, fileUrl: '' })
    ElMessage.success('上传成功')
  } catch (err: any) {
    ElMessage.error(err.message || '上传失败')
    emit('error', { code: 5000, message: err.message })
  } finally {
    uploading.value = false
  }
}

async function initEmbeddedEditor() {
  if (!currentFile.value) return
  editorLoading.value = true
  try {
    const res = await fileApi.getEditorConfig(currentFile.value.id, embeddedMode.value)
    const { config, apiUrl } = res.data

    await loadScript(apiUrl)
    const el = document.getElementById('embedded-editor')
    if (el) el.innerHTML = ''

    if (editorInstance) {
      try { editorInstance.destroyEditor() } catch {}
      editorInstance = null
    }

    config.height = '100%'
    config.width = '100%'
    config.events = {
      onReady: () => {
        editorLoading.value = false
        emit('doc-loaded', {
          fileName: currentFile.value!.original_name,
          fileType: currentFile.value!.document_type,
        })
      },
      onError: () => {
        editorLoading.value = false
      },
    }

    editorInstance = new onlyOfficeWindow.DocsAPI!.DocEditor('embedded-editor', config)
  } catch (err: any) {
    editorLoading.value = false
    emit('error', { code: 5000, message: err.message })
  }
}

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (onlyOfficeWindow.DocsAPI) { resolve(); return }
    const s = document.createElement('script')
    s.src = url
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load OnlyOffice API'))
    document.head.appendChild(s)
  })
}

function embeddedZoomIn() {
  const presets = [50, 75, 100, 125, 150, 200, 300]
  const next = presets.find(z => z > embeddedZoom.value)
  if (next) embeddedZoom.value = next
}

function embeddedZoomOut() {
  const presets = [50, 75, 100, 125, 150, 200, 300]
  const prev = [...presets].reverse().find(z => z < embeddedZoom.value)
  if (prev) embeddedZoom.value = prev
}

function toggleEmbeddedMode() {
  embeddedMode.value = embeddedMode.value === 'view' ? 'edit' : 'view'
  initEmbeddedEditor()
}

function downloadFile() {
  if (!currentFile.value) return
  const url = fileApi.getDownloadUrl(currentFile.value.id)
  const a = document.createElement('a')
  a.href = url
  a.download = currentFile.value.original_name
  a.click()
}

watch(currentFile, (val) => {
  if (val) initEmbeddedEditor()
})

onMounted(async () => {
  if (props.src) {
    const parts = props.src.split('/')
    const id = parts[parts.length - 1]?.replace(/\.[^.]+$/, '')
    if (id) {
      try {
        const res = await fileApi.getById(id)
        currentFile.value = res.data
      } catch {
        emit('error', { code: 4040, message: '文件不存在' })
      }
    }
  }
})

onBeforeUnmount(() => {
  if (editorInstance) {
    try { editorInstance.destroyEditor() } catch {}
  }
})
</script>

<style scoped>
.doc-preview-element {
  border: 1px solid var(--dp-border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif;
}

.upload-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--dp-border, #e2e8f0);
  border-radius: 8px;
  margin: 16px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.upload-zone.drag-active, .upload-zone:hover {
  border-color: var(--dp-primary, #0d9488);
  background: rgba(13, 148, 136, 0.04);
}

.upload-content {
  text-align: center;
}

.upload-icon {
  color: var(--dp-text-muted, #94a3b8);
  margin-bottom: 12px;
}

.upload-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--dp-text, #1e293b);
  margin-bottom: 8px;
}

.upload-hint {
  font-size: 13px;
  color: var(--dp-text-muted, #94a3b8);
}

.embedded-viewer {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.embedded-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #f8fafb;
  border-bottom: 1px solid #e2e8f0;
}

.embedded-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}

.embedded-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-display {
  min-width: 54px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.embedded-editor-area {
  flex: 1;
}

.embedded-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  z-index: 10;
}

.loading-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.no-file {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}
</style>
