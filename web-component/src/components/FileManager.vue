<template>
  <div class="file-manager">
    <div class="manager-toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="keyword"
          placeholder="搜索文件名..."
          clearable
          style="width: 280px"
          @input="debouncedSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-select
          v-model="typeFilter"
          placeholder="文件类型"
          clearable
          style="width: 140px"
          @change="loadFiles"
        >
          <el-option label="Word 文档" value="word" />
          <el-option label="Excel 表格" value="cell" />
          <el-option label="PPT 演示" value="slide" />
          <el-option label="PDF 文档" value="pdf" />
        </el-select>
      </div>

      <div class="toolbar-right">
        <el-upload
          ref="uploadRef"
          :action="uploadUrl"
          :headers="uploadHeaders"
          :show-file-list="false"
          :before-upload="beforeUpload"
          :on-success="onUploadSuccess"
          :on-error="onUploadError"
          :on-progress="onUploadProgress"
          :accept="acceptTypes"
        >
          <el-button type="primary">
            <el-icon style="margin-right: 6px"><Upload /></el-icon>
            上传文件
          </el-button>
        </el-upload>
      </div>
    </div>

    <el-progress
      v-if="uploading"
      :percentage="uploadPercent"
      :stroke-width="3"
      style="margin: 0 24px"
    />

    <div class="file-list-wrapper">
      <el-table
        v-loading="loading"
        :data="files"
        stripe
        style="width: 100%"
        empty-text="暂无文件，请先上传文档"
        @row-dblclick="handleRowDblclick"
      >
        <el-table-column label="文件名" min-width="300">
          <template #default="{ row }">
            <div class="file-name-cell">
              <span class="file-icon" :class="'icon-' + row.document_type">
                {{ getFileIcon(row.document_type) }}
              </span>
              <div>
                <div class="file-name">{{ row.original_name }}</div>
                <div class="file-meta">{{ row.file_ext }} · {{ row.fileSizeFormatted }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="类型" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getTypeTag(row.document_type)" size="small" effect="plain">
              {{ getTypeName(row.document_type) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="版本" width="80" align="center" prop="version">
          <template #default="{ row }">
            v{{ row.version }}
          </template>
        </el-table-column>

        <el-table-column label="上传时间" width="180" prop="created_at" />

        <el-table-column label="操作" width="280" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handlePreview(row)">
              预览
            </el-button>
            <el-button type="success" link size="small" @click="handleDownload(row)">
              下载
            </el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="total > pageSize" class="pagination-wrapper">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadFiles"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'FileManager',
}
</script>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Upload } from '@element-plus/icons-vue'
import { buildApiUrl, fileApi } from '../services/api'
import type { FileInfo } from '../services/api'

const emit = defineEmits<{
  preview: [file: FileInfo]
}>()

const files = ref<FileInfo[]>([])
const loading = ref(false)
const keyword = ref('')
const typeFilter = ref('')
const currentPage = ref(1)
const pageSize = 20
const total = ref(0)
const uploading = ref(false)
const uploadPercent = ref(0)
const uploadUrl = buildApiUrl('/upload')
const uploadHeaders = {
  Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
}
const acceptTypes = '.docx,.doc,.xlsx,.xls,.pptx,.ppt,.pdf,.odt,.ods,.odp,.rtf,.txt,.csv,.wps,.et,.dps'

let searchTimer: ReturnType<typeof setTimeout>

function debouncedSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    loadFiles()
  }, 300)
}

async function loadFiles() {
  loading.value = true
  try {
    const res = await fileApi.list({
      page: currentPage.value,
      size: pageSize,
      keyword: keyword.value,
      type: typeFilter.value,
    })
    files.value = res.data.records
    total.value = res.data.total
  } catch (err: any) {
    ElMessage.error(err.message || '加载文件列表失败')
  } finally {
    loading.value = false
  }
}

function handlePreview(row: FileInfo) {
  emit('preview', row)
}

function handleRowDblclick(row: FileInfo) {
  handlePreview(row)
}

function beforeUpload(file: any) {
  const maxSize = 200 * 1024 * 1024
  if (file.size > maxSize) {
    ElMessage.error('文件大小不能超过 200MB')
    return false
  }
  uploading.value = true
  uploadPercent.value = 0
  return true
}

function onUploadProgress(event: any) {
  if (event.percent) {
    uploadPercent.value = Math.round(event.percent)
  }
}

function onUploadSuccess(response: any) {
  uploading.value = false
  if (response.code === 0) {
    ElMessage.success(`${response.data.originalName} 上传成功`)
    loadFiles()
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

function onUploadError() {
  uploading.value = false
  ElMessage.error('上传失败，请检查网络连接')
}

function handleDownload(row: FileInfo) {
  const url = fileApi.getDownloadUrl(row.id)
  const link = document.createElement('a')
  link.href = url
  link.download = row.original_name
  link.click()
}

async function handleDelete(row: FileInfo) {
  try {
    await ElMessageBox.confirm(
      `确定要删除文件“${row.original_name}”吗？`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      }
    )
    await fileApi.delete(row.id)
    ElMessage.success('删除成功')
    loadFiles()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除失败')
    }
  }
}

function getFileIcon(type: string) {
  const icons: Record<string, string> = {
    word: 'W',
    cell: 'X',
    slide: 'P',
    pdf: 'PDF',
  }
  return icons[type] || 'F'
}

function getTypeName(type: string) {
  const names: Record<string, string> = {
    word: 'Word',
    cell: 'Excel',
    slide: 'PPT',
    pdf: 'PDF',
  }
  return names[type] || '文档'
}

function getTypeTag(type: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const tags: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    word: '',
    cell: 'success',
    slide: 'warning',
    pdf: 'danger',
  }
  return tags[type] || 'info'
}

onMounted(loadFiles)
</script>

<style scoped>
.file-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
}

.manager-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-radius: var(--dp-radius-md);
  border: 1px solid var(--dp-border-light);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbfd 100%);
  box-shadow: var(--dp-shadow-sm);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-list-wrapper {
  flex: 1;
  overflow: auto;
  padding: 8px;
  border-radius: var(--dp-radius-md);
  border: 1px solid var(--dp-border-light);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: var(--dp-shadow-sm);
}

.file-name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--dp-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.38), 0 4px 10px rgba(15, 23, 42, 0.16);
}

.icon-word { background: #2b579a; }
.icon-cell { background: #217346; }
.icon-slide { background: #b7472a; }
.icon-pdf { background: #dc2626; }

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--dp-text);
}

.file-meta {
  font-size: 12px;
  color: var(--dp-text-muted);
  margin-top: 2px;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 16px 8px 6px;
}

@media (max-width: 900px) {
  .file-manager {
    padding: 10px;
  }

  .manager-toolbar {
    padding: 10px;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .toolbar-left {
    width: 100%;
    flex-wrap: wrap;
  }

  .toolbar-right {
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
