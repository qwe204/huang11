import axios from 'axios'

function trimTrailingSlash(input: string) {
  return input.replace(/\/+$/, '')
}

function resolveApiBaseUrl() {
  const desktopApiBase = window.__DOC_PREVIEW_DESKTOP__?.apiBaseUrl
  if (desktopApiBase) {
    return trimTrailingSlash(desktopApiBase)
  }

  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000/api'
  }

  return '/api'
}

const apiBaseUrl = resolveApiBaseUrl()

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${trimTrailingSlash(apiBaseUrl)}${normalizedPath}`
}

const request = axios.create({
  baseURL: apiBaseUrl,
  timeout: 60000,
})

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (res) => {
    if (res.data.code !== 0) {
      return Promise.reject(new Error(res.data.message || '请求失败'))
    }
    return res.data
  },
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.dispatchEvent(new CustomEvent('auth:logout'))
    }
    const msg = err.response?.data?.message || err.message || '网络错误'
    return Promise.reject(new Error(msg))
  }
)

export interface FileInfo {
  id: string
  original_name: string
  stored_name: string
  file_path: string
  file_size: number
  file_ext: string
  document_type: string
  mime_type: string
  version: number
  created_at: string
  updated_at: string
  fileSizeFormatted?: string
}

export interface PageResult<T> {
  records: T[]
  total: number
  page: number
  size: number
}

export interface EditorConfigResponse {
  config: any
  apiUrl: string
  documentServerUrl: string
}

export type EditorZoomValue = number | 'fit-width' | 'fit-page'

export interface AssistantStatusResponse {
  available: boolean
  provider: string
  baseUrl: string
  model: string
  models: string[]
}

export interface AssistantChatMessage {
  role: 'assistant' | 'user'
  content: string
}

export interface AssistantChatResponse {
  reply: string
  model: string
  context: {
    mode: 'text_excerpt' | 'metadata_only'
    warning?: string
    hasExtractedText: boolean
  }
}

export type AssistantWorkflowType = 'word' | 'excel' | 'ppt'

export interface AssistantWorkflowPayload {
  prompt: string
  scale?: string
  language?: string
  extra?: string
  inputMode?: 'generate' | 'paste' | 'upload'
  referenceFileId?: string
  templateId?: string
}

export interface AssistantWorkflowPreview {
  title: string
  summary: string
  points: string[]
  detailPoints?: string[]
}

export interface AssistantWorkflowDataset {
  sheetName: string
  rowCount: number
  columnCount: number
  headers: string[]
}

export interface AssistantWorkflowResponse {
  workflow: AssistantWorkflowType
  model: string
  file?: FileInfo
  preview: AssistantWorkflowPreview
  metrics: Record<string, string>
  context: {
    referenceFileName: string
    referenceMode: string
    warning?: string
    extractedText: boolean
  }
  dataset?: AssistantWorkflowDataset | null
}

export const fileApi = {
  upload(file: File, onProgress?: (percent: number) => void) {
    const formData = new FormData()
    formData.append('file', file)
    return request.post<any, { data: FileInfo }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
  },

  list(params: { page?: number; size?: number; keyword?: string; type?: string }) {
    return request.get<any, { data: PageResult<FileInfo> }>('/files', { params })
  },

  getById(id: string) {
    return request.get<any, { data: FileInfo }>(`/files/${id}`)
  },

  delete(id: string) {
    return request.delete<any, any>(`/files/${id}`)
  },

  getDownloadUrl(id: string) {
    const url = buildApiUrl(`/files/${id}/download`)
    const token = localStorage.getItem('token')
    if (!token) {
      return url
    }
    return `${url}?token=${encodeURIComponent(token)}`
  },

  getEditorConfig(id: string, mode: 'view' | 'edit' = 'view', zoom?: EditorZoomValue) {
    return request.get<any, { data: EditorConfigResponse }>(`/editor/config/${id}`, {
      params: {
        mode,
        ...(zoom === undefined ? {} : { zoom }),
      },
    })
  },

  getFormats() {
    return request.get<any, { data: { supported: string[]; maxSize: number; maxSizeMB: number } }>('/formats')
  },
}

export const assistantApi = {
  getStatus() {
    return request.get<any, { data: AssistantStatusResponse }>('/ai/status')
  },

  chat(fileId: string, messages: AssistantChatMessage[]) {
    return request.post<any, { data: AssistantChatResponse }>('/ai/chat', {
      fileId,
      messages,
    })
  },

  runWorkflow(type: AssistantWorkflowType, payload: AssistantWorkflowPayload) {
    return request.post<any, { data: AssistantWorkflowResponse }>(`/ai/workflows/${type}`, payload)
  },
}

export interface UserInfo {
  id: number
  username: string
  nickname: string
  email: string
  avatar: string
  role: string
  status?: number
  created_at?: string
  updated_at?: string
}

export interface LoginResult {
  token: string
  user: UserInfo
}

export const authApi = {
  login(username: string, password: string) {
    return request.post<any, { data: LoginResult }>('/auth/login', { username, password })
  },

  register(data: { username: string; password: string; nickname?: string; email?: string }) {
    return request.post<any, { data: LoginResult }>('/auth/register', data)
  },

  getMe() {
    return request.get<any, { data: UserInfo }>('/auth/me')
  },

  updateProfile(data: { nickname?: string; email?: string; avatar?: string }) {
    return request.put<any, any>('/auth/profile', data)
  },

  changePassword(oldPassword: string, newPassword: string) {
    return request.put<any, any>('/auth/password', { oldPassword, newPassword })
  },
}

export const adminApi = {
  listUsers(params: { page?: number; size?: number; keyword?: string; role?: string }) {
    return request.get<any, { data: PageResult<UserInfo> }>('/admin/users', { params })
  },

  createUser(data: { username: string; password: string; nickname?: string; email?: string; role?: string }) {
    return request.post<any, any>('/admin/users', data)
  },

  updateUser(id: number, data: { nickname?: string; email?: string; role?: string; status?: number }) {
    return request.put<any, any>(`/admin/users/${id}`, data)
  },

  resetPassword(id: number, password: string) {
    return request.put<any, any>(`/admin/users/${id}/reset-password`, { password })
  },

  deleteUser(id: number) {
    return request.delete<any, any>(`/admin/users/${id}`)
  },

  getStats() {
    return request.get<any, { data: { userCount: number; docCount: number; totalSize: number } }>('/admin/stats')
  },
}
