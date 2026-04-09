<template>
  <div class="ai-page">
    <input ref="fileInputRef" class="hidden-input" type="file" :accept="currentAccept" @change="handleSelectFile">

    <section v-if="studioVisible" class="studio">
      <aside class="studio-list">
        <button
          v-for="tpl in templates"
          :key="tpl.id"
          type="button"
          class="studio-item"
          :class="{ active: selectedTemplateId === tpl.id }"
          @click="selectedTemplateId = tpl.id"
        >
          <div class="thumb" :style="templateVars(tpl)">
            <div class="ribbons"><span /><span /><span /></div>
            <div class="thumb-text">PRESENTATION TITLE</div>
          </div>
        </button>
      </aside>

      <div class="studio-stage">
        <article class="slide cover" :style="selectedTemplateVars">
          <div class="ribbons"><span /><span /><span /></div>
          <div class="watermark">{{ selectedTemplate.watermark }}</div>
          <div class="cover-copy">
            <h2>PRESENTATION TITLE</h2>
            <p>Reporter: xxx</p>
            <p>xx.xx.xx</p>
          </div>
        </article>

        <div class="slide-grid">
          <article class="slide" :style="selectedTemplateVars">
            <div class="mini-kicker">CATALOGUE</div>
            <h3>Contents</h3>
            <div class="content-grid">
              <div v-for="item in contentsItems" :key="item.no" class="content-item">
                <strong>{{ item.no }}</strong>
                <span>{{ item.label }}</span>
              </div>
            </div>
          </article>

          <article class="slide center" :style="selectedTemplateVars">
            <strong class="chapter-no">01</strong>
            <h3>CHAPTER TITLE</h3>
          </article>

          <article class="slide" :style="selectedTemplateVars">
            <h3>Chapter Title</h3>
            <div class="timeline">
              <div v-for="item in timelineItems" :key="item" class="timeline-item">
                <span class="timeline-dot" />
                <strong>{{ item }}</strong>
                <small>Content Title</small>
              </div>
            </div>
          </article>

          <article class="slide center" :style="selectedTemplateVars">
            <h3>THANKS</h3>
            <p>Thanks for watching</p>
          </article>
        </div>
      </div>

      <aside class="studio-panel">
        <button type="button" class="close-btn" @click="studioVisible = false">X</button>

        <div class="mode-switch compact">
          <button
            v-for="mode in inputModes"
            :key="mode.id"
            type="button"
            class="mode-pill"
            :class="{ active: inputMode === mode.id }"
            @click="inputMode = mode.id"
          >
            <span class="mode-badge">{{ mode.badge }}</span>
            <span>{{ mode.label }}</span>
          </button>
        </div>

        <div class="studio-box">
          <textarea v-model="prompt" class="studio-textarea" :placeholder="currentPlaceholder" />

          <div v-if="inputMode === 'upload'" class="upload-lite">
            <strong>{{ currentTool.uploadTitle }}</strong>
            <p v-if="!uploadedFile">{{ currentTool.uploadDesc }}</p>
            <p v-else>已上传：{{ uploadedFile.name }}</p>
            <div v-if="uploading" class="progress"><div class="bar" :style="{ width: `${uploadProgress}%` }" /></div>
            <div class="upload-actions">
              <button type="button" class="ghost-btn" :disabled="uploading" @click="openFilePicker">
                {{ uploading ? '上传中...' : uploadedFile ? '重新选择' : '上传参考文件' }}
              </button>
              <button v-if="uploadedFile" type="button" class="text-link" @click="clearUploadedFile">清除</button>
            </div>
          </div>

          <div class="toolbar compact-tools">
            <select v-model="selectedScale" class="tool-select">
              <option v-for="item in currentTool.scales" :key="item" :value="item">{{ item }}</option>
            </select>
            <select v-model="selectedLanguage" class="tool-select">
              <option v-for="item in currentTool.languages" :key="item" :value="item">{{ item }}</option>
            </select>
            <select v-model="selectedExtra" class="tool-select">
              <option v-for="item in currentTool.extras" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
        </div>

        <button type="button" class="primary-btn full" :disabled="running" @click="handleGenerate">
          {{ running ? '生成中...' : '继续' }}
        </button>

        <div class="studio-meta">
          <span>已选模板</span>
          <strong>{{ selectedTemplate.name }}</strong>
          <small>{{ selectedTemplate.meta }}</small>
        </div>

        <div v-if="latestResult" class="result-card">
          <div class="kicker">最新输出</div>
          <strong>{{ latestResult.preview.title }}</strong>
          <p>{{ latestResult.preview.summary }}</p>
          <div v-if="latestResult.file" class="result-actions">
            <button type="button" class="ghost-btn" @click="previewGeneratedFile">打开文档</button>
            <button type="button" class="text-link" @click="downloadGeneratedFile">下载</button>
          </div>
        </div>
      </aside>
    </section>

    <div v-else class="layout">
      <aside class="rail">
        <button v-for="tool in tools" :key="tool.id" type="button" class="rail-item" :class="{ active: activeTool === tool.id }" @click="activeTool = tool.id">
          <span class="rail-badge">{{ tool.badge }}</span>
          <span class="rail-name">{{ tool.short }}</span>
          <span class="rail-tip">{{ tool.tip }}</span>
        </button>
      </aside>

      <section class="main">
        <header class="head">
          <div class="status-bar">
            <span class="status-pill" :class="{ online: assistantReady, offline: !assistantReady }"><span class="dot" />{{ assistantReady ? '本地模型在线' : '本地模型异常' }}</span>
            <span class="status-text">{{ statusText }}</span>
          </div>
          <h2>{{ currentTool.headline }}</h2>
          <p>{{ currentTool.subline }}</p>
          <div class="mode-switch">
            <button v-for="mode in inputModes" :key="mode.id" type="button" class="mode-pill" :class="{ active: inputMode === mode.id }" @click="inputMode = mode.id">
              <span class="mode-badge">{{ mode.badge }}</span>
              <span>{{ mode.label }}</span>
            </button>
          </div>
        </header>

        <section class="composer">
          <div class="composer-top">
            <span>{{ currentTool.panelTitle }}</span>
            <div class="top-actions">
              <span v-if="running" class="busy-badge">执行中</span>
              <button type="button" class="ghost-btn" @click="loadStatus">刷新状态</button>
            </div>
          </div>

          <textarea v-model="prompt" class="composer-input" :placeholder="currentPlaceholder" />

          <div v-if="inputMode === 'upload'" class="upload-box">
            <div class="upload-copy">
              <strong>{{ currentTool.uploadTitle }}</strong>
              <p v-if="!uploadedFile">{{ currentTool.uploadDesc }}</p>
              <p v-else>已上传参考文件：{{ uploadedFile.name }}</p>
              <div v-if="uploading" class="progress"><div class="bar" :style="{ width: `${uploadProgress}%` }" /></div>
            </div>
            <div class="upload-actions">
              <button type="button" class="ghost-btn" :disabled="uploading" @click="openFilePicker">{{ uploading ? '上传中...' : uploadedFile ? '重新选择文件' : '选择参考文件' }}</button>
              <button v-if="uploadedFile" type="button" class="text-link" @click="clearUploadedFile">清除</button>
            </div>
          </div>

          <div class="toolbar">
            <select v-model="selectedScale" class="tool-select"><option v-for="item in currentTool.scales" :key="item" :value="item">{{ item }}</option></select>
            <select v-model="selectedLanguage" class="tool-select"><option v-for="item in currentTool.languages" :key="item" :value="item">{{ item }}</option></select>
            <select v-model="selectedExtra" class="tool-select"><option v-for="item in currentTool.extras" :key="item" :value="item">{{ item }}</option></select>
            <button type="button" class="primary-btn" :disabled="running" @click="handleGenerate">{{ running ? '执行中...' : currentTool.cta }}</button>
          </div>
        </section>

        <div class="chips">
          <button v-for="chip in currentTool.chips" :key="chip" type="button" class="chip" @click="prompt = chip">{{ chip }}</button>
        </div>

        <section v-if="activeTool === 'ppt'" class="templates">
          <div class="section-head">
            <div><div class="kicker">从模板开始</div><h3>Word 智能生成 PPT 模板</h3></div>
            <button type="button" class="text-link" @click="openTemplateStudio(selectedTemplateId)">进入模板工作台</button>
          </div>
          <div class="template-grid">
            <button v-for="tpl in templates" :key="tpl.id" type="button" class="template-card" :class="{ selected: selectedTemplateId === tpl.id }" @click="openTemplateStudio(tpl.id)">
              <div class="template-preview" :style="templateVars(tpl)"><div class="ribbons"><span /><span /><span /></div><div class="preview-copy"><strong>{{ tpl.scene }}</strong><span>{{ tpl.name }}</span></div></div>
              <div class="template-card-info"><div class="template-name">{{ tpl.name }}</div><div class="template-meta">{{ tpl.meta }}</div></div>
            </button>
          </div>
        </section>

        <section class="summary-grid">
          <article class="panel">
            <div class="section-head compact"><div><div class="kicker">当前配置</div><h3>执行参数</h3></div></div>
            <div class="rows">
              <div class="row"><span>能力模块</span><strong>{{ currentTool.name }}</strong></div>
              <div class="row"><span>输入方式</span><strong>{{ currentInput.label }}</strong></div>
              <div class="row"><span>输出规模</span><strong>{{ selectedScale }}</strong></div>
              <div class="row"><span>输出语言</span><strong>{{ selectedLanguage }}</strong></div>
              <div class="row"><span>附加结果</span><strong>{{ selectedExtra }}</strong></div>
              <div v-if="activeTool === 'ppt'" class="row"><span>PPT 模板</span><strong>{{ selectedTemplateName }}</strong></div>
              <div class="row"><span>参考文件</span><strong>{{ uploadedFile?.name || '未上传' }}</strong></div>
              <div v-for="[label, value] in metricEntries" :key="label" class="row"><span>{{ label }}</span><strong>{{ value }}</strong></div>
            </div>
            <div v-if="contextWarning" class="warning-box">{{ contextWarning }}</div>
            <div class="model-box"><div class="kicker">模型连接</div><div class="model-name">{{ latestResult?.model || status?.model || '未识别模型' }}</div><div class="model-url">{{ status?.baseUrl || '未获取到接口地址' }}</div></div>
          </article>

          <article class="panel">
            <div class="section-head compact">
              <div><div class="kicker">输出预览</div><h3>{{ previewTitle }}</h3></div>
              <button type="button" class="text-link" @click="emit('go-files')">前往文档管理</button>
            </div>
            <p class="preview-text">{{ previewText }}</p>
            <div class="preview-list">
              <div v-for="item in previewPoints" :key="item" class="preview-item"><span class="preview-dot" /><span>{{ item }}</span></div>
              <div v-for="item in previewDetailPoints" :key="`detail-${item}`" class="preview-item muted"><span class="preview-dot light" /><span>{{ item }}</span></div>
            </div>
            <div v-if="latestResult?.file" class="result-actions">
              <button type="button" class="primary-btn compact-btn" @click="previewGeneratedFile">打开生成文档</button>
              <button type="button" class="ghost-btn" @click="downloadGeneratedFile">下载文件</button>
            </div>
            <div class="foot-note">{{ checkedAtText }}</div>
          </article>
        </section>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
export default { name: 'AiIntegrationPage' }
</script>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { ElMessage } from 'element-plus'
import { assistantApi, fileApi } from '../services/api'
import type { AssistantStatusResponse, AssistantWorkflowResponse, AssistantWorkflowType, FileInfo } from '../services/api'

type InputMode = 'generate' | 'paste' | 'upload'
type ToolId = AssistantWorkflowType
interface ToolConfig { id: ToolId; badge: string; short: string; tip: string; name: string; headline: string; subline: string; panelTitle: string; uploadTitle: string; uploadDesc: string; cta: string; desc: string; tags: string[]; scales: string[]; languages: string[]; extras: string[]; chips: string[]; accept: string; placeholders: Record<InputMode, string> }
interface PptTemplate { id: string; name: string; scene: string; meta: string; gradient: string; accent: string; accentStrong: string; accentSoft: string; ink: string; muted: string; outline: string; watermark: string }
interface ReferenceFileSummary { id: string; name: string; documentType: string }

const emit = defineEmits<{ 'go-files': []; 'preview-file': [file: FileInfo] }>()
const inputModes = [{ id: 'generate', label: '生成', badge: 'AI' }, { id: 'paste', label: '粘贴文本', badge: 'TXT' }, { id: 'upload', label: '上传文件', badge: 'UP' }] as const
const tools: ToolConfig[] = [
  { id: 'word', badge: 'W', short: 'Word', tip: '正式写作', name: 'Word 文档生成', headline: 'AI 文档写作工作台', subline: '输入主题、要求或提纲，快速生成正式 Word 报告、通知、总结和方案。', panelTitle: '从一句话开始生成 Word 文档', uploadTitle: '上传参考材料生成 Word 文档', uploadDesc: '适合上传历史方案、会议纪要或制度文件作为续写参考。', cta: '生成 Word 初稿', desc: '适合方案、总结、通知、公文和结构化长文写作。', tags: ['结构化成稿', '自动摘要', '目录建议'], scales: ['2-4 页', '4-8 页', '8-12 页'], languages: ['简体中文', '正式公文风', '中英双语'], extras: ['正文 + 摘要', '正文 + 目录', '正文 + 行动建议'], chips: ['年度工作总结与计划', '项目立项实施方案', '会议纪要转正式稿', '对外通知公告'], accept: '.doc,.docx,.odt,.rtf,.txt,.md,.pdf', placeholders: { generate: '输入主题、背景、目标和风格要求，快速生成 Word 文档初稿', paste: '粘贴纪要、资料或零散段落，AI 将整理为规范 Word 文档', upload: '描述希望基于上传文件生成的目标，例如“生成 2026 版项目计划”' } },
  { id: 'excel', badge: 'X', short: 'Excel', tip: '数据分析', name: 'Excel 表格分析', headline: 'AI 表格分析工作台', subline: '围绕经营数据、销售明细和 KPI 表格做趋势解读、异常诊断和图表建议。', panelTitle: '输入分析目标，生成 Excel 洞察', uploadTitle: '上传 Excel 文件进行分析', uploadDesc: '适合上传经营报表、销售台账、预算执行表并输出结论。', cta: '生成分析结论', desc: '适合财务、销售、项目、库存和经营分析场景。', tags: ['趋势解读', '异常定位', '图表建议'], scales: ['快速概览', '标准分析', '深度诊断'], languages: ['简体中文', '汇报口径', '管理层摘要'], extras: ['结论 + 图表建议', '结论 + 风险提示', '结论 + 复盘清单'], chips: ['月度经营数据异常分析', '销售排名与同比趋势', '项目成本偏差诊断', '库存周转健康度'], accept: '.xlsx,.xls,.ods,.csv,.et,.json,.txt', placeholders: { generate: '输入指标背景和希望回答的问题，例如“分析 3 月销售额下滑原因”', paste: '粘贴表头、关键数据或摘要内容，AI 将提炼结论和风险', upload: '描述上传表格后的目标，例如“识别异常波动并给出图表建议”' } },
  { id: 'ppt', badge: 'P', short: 'PPT', tip: '文档转演示', name: 'Word 智能生成 PPT', headline: 'AI PPT 制作工作台', subline: '根据 Word 文档内容自动生成演示结构、逐页文案，并匹配可选 PPT 模板。', panelTitle: '输入话题或上传 Word 文档，极速生成演示稿', uploadTitle: '上传 Word 文档智能生成 PPT', uploadDesc: '适合上传方案、报告、培训材料，自动提取主线并转成汇报稿。', cta: '生成 PPT 成稿', desc: '适合汇报、路演、培训和研究分享类演示文稿生成。', tags: ['逐页标题', '页面要点', '模板匹配'], scales: ['10-15 幻灯片', '15-20 幻灯片', '20-30 幻灯片'], languages: ['简体中文', '商务汇报版', '演讲稿辅助'], extras: ['逐页文案', '文案 + 演讲备注', '文案 + 配图建议'], chips: ['季度经营汇报', '项目路演方案', '教学培训课件', '行业研究分享'], accept: '.doc,.docx,.rtf,.txt,.md,.pdf', placeholders: { generate: '输入你的话题、汇报对象与应用场景，快速生成 PPT 结构与逐页内容', paste: '粘贴 Word 摘要或章节内容，AI 将转成演示逻辑和页面文案', upload: '描述希望基于上传 Word 文档生成的 PPT 类型，例如“生成高层汇报版”' } },
]
const templates: PptTemplate[] = [
  { id: 'biz', name: '商务极简', scene: '经营汇报', meta: '适合季度复盘 / 高层简报', gradient: 'linear-gradient(135deg,#ffffff 0%,#f6fffc 36%,#a7fff0 100%)', accent: '#78f0de', accentStrong: '#5dd6c7', accentSoft: 'rgba(120,240,222,.18)', ink: '#182319', muted: '#5e6b61', outline: 'rgba(120,240,222,.28)', watermark: 'DEVELOP' },
  { id: 'dark', name: '科技曜黑', scene: '技术方案', meta: '适合架构汇报 / 产品发布', gradient: 'linear-gradient(135deg,#0d1015 0%,#232935 58%,#5f6b7f 100%)', accent: '#d7dde7', accentStrong: '#ffffff', accentSoft: 'rgba(255,255,255,.08)', ink: '#f8fafc', muted: 'rgba(248,250,252,.72)', outline: 'rgba(255,255,255,.12)', watermark: 'FUTURE' },
  { id: 'edu', name: '教学培训', scene: '课程课件', meta: '适合讲义培训 / 内训分享', gradient: 'linear-gradient(135deg,#ffffff 0%,#eef3ff 48%,#b2c5ff 100%)', accent: '#8b9cff', accentStrong: '#b6c4ff', accentSoft: 'rgba(139,156,255,.16)', ink: '#24304f', muted: '#677489', outline: 'rgba(139,156,255,.22)', watermark: 'LEARN' },
  { id: 'brand', name: '活动策划', scene: '创意主题', meta: '适合品牌传播 / 节庆活动', gradient: 'linear-gradient(135deg,#255840 0%,#4b9868 52%,#f4d57c 100%)', accent: '#ffd67b', accentStrong: '#f4f1b0', accentSoft: 'rgba(255,214,123,.2)', ink: '#fefcf4', muted: 'rgba(254,252,244,.76)', outline: 'rgba(255,214,123,.18)', watermark: 'BRAND' },
  { id: 'light', name: '简报白昼', scene: '工作汇报', meta: '适合周报月报 / 进度复盘', gradient: 'linear-gradient(135deg,#ffffff 0%,#f7f9fc 52%,#e4eaf3 100%)', accent: '#cad4e2', accentStrong: '#e9eef6', accentSoft: 'rgba(202,212,226,.22)', ink: '#233143', muted: '#728094', outline: 'rgba(202,212,226,.3)', watermark: 'REPORT' },
  { id: 'blue', name: '研究蓝图', scene: '研究分享', meta: '适合课题汇报 / 洞察分析', gradient: 'linear-gradient(135deg,#f6fbff 0%,#d7ecff 48%,#79b9ef 100%)', accent: '#79b9ef', accentStrong: '#a8d5ff', accentSoft: 'rgba(121,185,239,.18)', ink: '#16324d', muted: '#64809b', outline: 'rgba(121,185,239,.26)', watermark: 'INSIGHT' },
]
const contentsItems = [{ no: '01', label: 'Section Title' }, { no: '02', label: 'Section Title' }, { no: '03', label: 'Section Title' }, { no: '04', label: 'Section Title' }]
const timelineItems = ['01', '02', '03', '04']

const fileInputRef = ref<HTMLInputElement>()
const status = ref<AssistantStatusResponse | null>(null)
const latestResult = ref<AssistantWorkflowResponse | null>(null)
const errorMessage = ref('')
const checkedAt = ref<Date | null>(null)
const generatedAt = ref<Date | null>(null)
const running = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const activeTool = ref<ToolId>('ppt')
const inputMode = ref<InputMode>('generate')
const prompt = ref('')
const selectedScale = ref('')
const selectedLanguage = ref('')
const selectedExtra = ref('')
const selectedTemplateId = ref('biz')
const studioVisible = ref(false)
const uploadedFile = ref<ReferenceFileSummary | null>(null)

const currentTool = computed(() => tools.find(item => item.id === activeTool.value) || tools[0])
const currentInput = computed(() => inputModes.find(item => item.id === inputMode.value) || inputModes[0])
const assistantReady = computed(() => !!status.value?.available)
const currentPlaceholder = computed(() => currentTool.value.placeholders[inputMode.value])
const currentAccept = computed(() => currentTool.value.accept)
const selectedTemplate = computed(() => templates.find(item => item.id === selectedTemplateId.value) || templates[0])
const selectedTemplateName = computed(() => selectedTemplate.value.name)
const statusText = computed(() => assistantReady.value ? `当前模型：${status.value?.model || '未识别'}` : (errorMessage.value || '正在检查本地模型连接'))
const previewTitle = computed(() => latestResult.value?.preview.title || `${currentTool.value.name} 输出预览`)
const previewText = computed(() => latestResult.value?.preview.summary || currentTool.value.desc)
const previewPoints = computed(() => (latestResult.value?.preview.points?.length ? latestResult.value.preview.points : currentTool.value.tags))
const previewDetailPoints = computed(() => latestResult.value?.preview.detailPoints || [])
const metricEntries = computed(() => Object.entries(latestResult.value?.metrics || {}))
const contextWarning = computed(() => latestResult.value?.context.warning || '')
const checkedAtText = computed(() => `最近动作：${(generatedAt.value || checkedAt.value || new Date()).toLocaleString('zh-CN', { hour12: false })}`)
const selectedTemplateVars = computed(() => templateVars(selectedTemplate.value))

function templateVars(tpl: PptTemplate): CSSProperties {
  return {
    '--tpl-gradient': tpl.gradient,
    '--tpl-accent': tpl.accent,
    '--tpl-accent-strong': tpl.accentStrong,
    '--tpl-accent-soft': tpl.accentSoft,
    '--tpl-ink': tpl.ink,
    '--tpl-muted': tpl.muted,
    '--tpl-outline': tpl.outline,
  } as CSSProperties
}

function resetOptions() {
  selectedScale.value = currentTool.value.scales[0]
  selectedLanguage.value = currentTool.value.languages[0]
  selectedExtra.value = currentTool.value.extras[0]
  prompt.value = currentTool.value.chips[0]
  latestResult.value = null
  clearUploadedFile()
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function clearUploadedFile() {
  uploadedFile.value = null
  uploadProgress.value = 0
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

function openTemplateStudio(id: string) {
  activeTool.value = 'ppt'
  selectedTemplateId.value = id
  studioVisible.value = true
}

async function handleSelectFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  uploadProgress.value = 0
  try {
    const response = await fileApi.upload(file, percent => { uploadProgress.value = percent })
    const raw = response.data as any
    uploadedFile.value = { id: raw.id, name: raw.originalName || raw.original_name || file.name, documentType: raw.documentType || raw.document_type || 'word' }
    ElMessage.success(`${uploadedFile.value.name} 上传成功`)
  } catch (err: any) {
    clearUploadedFile()
    ElMessage.error(err.message || '参考文件上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function ensureAssistantReady() {
  if (assistantReady.value) return true
  await loadStatus()
  return !!status.value?.available
}

function validateWorkflow() {
  if (!prompt.value.trim() && !uploadedFile.value) {
    ElMessage.warning('请输入任务说明或上传参考文件')
    return false
  }
  if (inputMode.value === 'upload' && !uploadedFile.value) {
    ElMessage.warning('请先上传参考文件')
    return false
  }
  return true
}

async function handleGenerate() {
  if (!validateWorkflow()) return
  if (!(await ensureAssistantReady())) {
    ElMessage.error('本地模型当前不可用，请先检查 LM Studio 状态')
    return
  }
  running.value = true
  try {
    const response = await assistantApi.runWorkflow(activeTool.value, {
      prompt: prompt.value.trim(),
      scale: selectedScale.value,
      language: selectedLanguage.value,
      extra: selectedExtra.value,
      inputMode: inputMode.value,
      referenceFileId: uploadedFile.value?.id,
      templateId: activeTool.value === 'ppt' ? selectedTemplateId.value : undefined,
    })
    latestResult.value = response.data
    generatedAt.value = new Date()
    ElMessage.success(`${currentTool.value.name} 已执行完成`)
  } catch (err: any) {
    ElMessage.error(err.message || 'AI 工作流执行失败')
  } finally {
    running.value = false
  }
}

function previewGeneratedFile() {
  if (latestResult.value?.file) emit('preview-file', latestResult.value.file)
}

function downloadGeneratedFile() {
  const file = latestResult.value?.file
  if (file?.id) window.open(fileApi.getDownloadUrl(file.id), '_blank')
}

async function loadStatus() {
  try {
    const res = await assistantApi.getStatus()
    status.value = res.data
    checkedAt.value = new Date()
    errorMessage.value = ''
  } catch (err: any) {
    status.value = null
    checkedAt.value = new Date()
    errorMessage.value = err.message || '获取 AI 集成状态失败'
  }
}

watch(activeTool, next => {
  resetOptions()
  if (next !== 'ppt') studioVisible.value = false
})

onMounted(() => {
  resetOptions()
  void loadStatus()
})
</script>

<style scoped>
.ai-page{height:100%;overflow:auto;padding:24px;background:radial-gradient(circle at top center,rgba(91,124,255,.08),transparent 26%),linear-gradient(180deg,#f7f8fb 0%,#fbfbfd 48%,#fff 100%)}.hidden-input{display:none}.layout{max-width:1360px;margin:0 auto;display:grid;grid-template-columns:92px minmax(0,1fr);gap:28px}.rail{position:sticky;top:24px;display:flex;flex-direction:column;gap:16px;height:fit-content}.rail-item,.panel,.composer,.templates,.template-card,.studio-list,.studio-panel{background:rgba(255,255,255,.94);border:1px solid rgba(226,232,240,.9);box-shadow:0 18px 40px rgba(148,163,184,.12)}.rail-item{border:none;border-radius:24px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:.18s}.rail-item.active,.rail-item:hover,.template-card:hover,.template-card.selected,.studio-item.active .thumb{transform:translateY(-2px)}.rail-badge,.mode-badge{display:flex;align-items:center;justify-content:center}.rail-badge{width:40px;height:40px;border-radius:14px;background:linear-gradient(135deg,#5b7cff,#78b3ff);color:#fff;font-weight:800}.rail-name{font-size:13px;font-weight:700}.rail-tip,.status-text,.template-meta,.model-url,.preview-text,.foot-note{color:#6b7280}.head{max-width:940px;margin:8px auto 0;text-align:center}.status-bar,.mode-switch{display:inline-flex;align-items:center}.status-bar{gap:10px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.88)}.status-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700}.status-pill.online{background:rgba(187,247,208,.42);color:#166534}.status-pill.offline{background:rgba(254,215,170,.5);color:#9a3412}.dot{width:8px;height:8px;border-radius:50%;background:currentColor}.head h2{margin:24px 0 10px;font-size:38px;line-height:1.12;font-weight:800;color:#16181d}.head p{margin:0 auto;max-width:760px;font-size:15px;line-height:1.8;color:#7b8190}.mode-switch{gap:8px;margin-top:24px;padding:6px;border-radius:999px;background:rgba(255,255,255,.9)}.mode-switch.compact{margin-top:18px}.mode-pill{border:none;padding:11px 16px;border-radius:999px;display:inline-flex;align-items:center;gap:10px;background:transparent;color:#6b7280;font-size:14px;font-weight:600;cursor:pointer}.mode-pill.active{background:#fff;box-shadow:0 8px 18px rgba(148,163,184,.14);color:#111827}.mode-badge{width:24px;height:24px;border-radius:999px;background:rgba(91,124,255,.12);color:#5b7cff;font-size:11px;font-weight:800}.composer,.panel,.templates{border-radius:24px}.composer{max-width:1080px;margin:22px auto 0;padding:18px}.composer-top,.section-head,.toolbar,.upload-box,.upload-actions,.result-actions,.row{display:flex;align-items:center;justify-content:space-between;gap:16px}.composer-top{margin-bottom:14px;font-size:14px;font-weight:700;color:#6b7280}.top-actions,.result-actions{display:flex;align-items:center;gap:12px}.busy-badge{padding:6px 10px;border-radius:999px;background:rgba(91,124,255,.1);color:#5b7cff;font-size:12px;font-weight:700}.ghost-btn,.text-link{border:none;background:transparent;cursor:pointer}.ghost-btn{padding:10px 14px;border-radius:14px;background:rgba(91,124,255,.08);color:#5b7cff;font-weight:700}.text-link{color:#5b7cff;font-weight:700}.composer-input,.studio-textarea{width:100%;border:none;outline:none;background:transparent;font-size:17px;line-height:1.75;color:#111827;font-family:'PingFang SC','Microsoft YaHei',sans-serif}.composer-input{min-height:150px;resize:vertical}.studio-textarea{min-height:220px;resize:none}.composer-input::placeholder,.studio-textarea::placeholder{color:#b3b9c6}.upload-box,.upload-lite{margin-top:14px;padding:16px;border-radius:18px;background:linear-gradient(180deg,rgba(244,247,255,.96),rgba(248,250,255,.92))}.upload-copy,.studio-meta,.result-card{display:grid;gap:8px}.progress{width:100%;height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden}.bar{height:100%;border-radius:999px;background:linear-gradient(135deg,#5b7cff,#7aa9ff)}.toolbar{flex-wrap:wrap;margin-top:16px}.tool-select,.primary-btn{height:46px}.tool-select{padding:0 14px;border-radius:16px;border:1px solid rgba(226,232,240,.92);background:#fff;font-size:14px;font-weight:600;color:#111827}.primary-btn{margin-left:auto;padding:0 22px;border:none;border-radius:16px;background:linear-gradient(135deg,#5b7cff,#6f94ff);color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 14px 28px rgba(91,124,255,.26)}.primary-btn.full{width:100%;margin-left:0}.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:1080px;margin:18px auto 0}.chip{border:1px solid rgba(226,232,240,.94);border-radius:999px;padding:10px 16px;background:rgba(255,255,255,.88);color:#6b7280;font-size:13px;cursor:pointer}.templates{margin-top:34px;padding:24px}.section-head{margin-bottom:18px}.section-head.compact{margin-bottom:16px}.kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#98a1b2}.section-head h3{margin:6px 0 0;font-size:28px;line-height:1.15;color:#111827}.template-grid,.summary-grid,.slide-grid{display:grid}.template-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.template-card{padding:14px;text-align:left;cursor:pointer;transition:.18s;border-radius:22px}.template-preview,.thumb,.slide{position:relative;overflow:hidden;border-radius:20px;background:var(--tpl-gradient);border:1px solid var(--tpl-outline)}.template-preview{height:170px}.preview-copy,.thumb-text,.cover-copy{position:absolute;z-index:1;color:var(--tpl-ink)}.preview-copy{left:18px;bottom:16px;display:grid;gap:4px}.thumb-text{left:12px;bottom:10px;font-size:10px;font-weight:800}.template-card-info{margin-top:14px}.template-name{font-size:18px;font-weight:800;color:#111827}.summary-grid{grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:18px;margin-top:34px}.panel{padding:24px}.rows{display:grid;gap:12px}.row{padding-bottom:12px;border-bottom:1px dashed rgba(226,232,240,.9)}.row:last-child{padding-bottom:0;border-bottom:none}.row span{font-size:13px;color:#6b7280}.row strong{font-size:14px;color:#111827;text-align:right;word-break:break-word}.warning-box{margin-top:18px;padding:14px 16px;border-radius:16px;background:rgba(254,249,195,.55);color:#854d0e;font-size:13px;line-height:1.7}.model-box{margin-top:20px;padding:18px;border-radius:18px;background:linear-gradient(135deg,#f5f8ff 0%,#eef3ff 100%)}.model-name{margin-top:10px;font-size:20px;font-weight:800;color:#1f2937}.preview-list{display:grid;gap:12px;margin-top:18px}.preview-item{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.75;color:#111827}.preview-item.muted{color:#64748b}.preview-dot{width:8px;height:8px;margin-top:8px;border-radius:50%;background:#5b7cff;flex-shrink:0}.preview-dot.light{background:#c7d2fe}.foot-note{margin-top:22px;padding-top:16px;border-top:1px dashed rgba(226,232,240,.92);font-size:12px}
.studio{min-height:calc(100vh - 112px);max-width:1380px;margin:0 auto;display:grid;grid-template-columns:118px minmax(0,1fr) 380px;gap:20px}.studio-list,.studio-panel{padding:16px;border-radius:28px}.studio-list{display:flex;flex-direction:column;gap:12px;overflow:auto}.studio-item{border:none;background:transparent;padding:0;cursor:pointer}.thumb{height:92px}.studio-stage{display:grid;gap:14px}.cover{min-height:360px;padding:44px}.cover-copy{left:42px;top:48px;display:grid;gap:12px;max-width:320px}.cover-copy h2{margin:0;font-size:60px;line-height:.96;letter-spacing:-.04em}.cover-copy p,.slide p,.preview-copy span{margin:0;color:var(--tpl-muted)}.watermark{position:absolute;left:34px;bottom:18px;font-size:86px;font-weight:800;color:rgba(255,255,255,.28);mix-blend-mode:soft-light}.slide-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.slide{min-height:198px;padding:24px;box-shadow:0 18px 44px rgba(148,163,184,.12);color:var(--tpl-ink)}.slide.center{display:grid;place-content:center;text-align:center}.slide h3{margin:6px 0 0;font-size:34px;line-height:1.06}.mini-kicker{font-size:12px;font-weight:700;letter-spacing:.12em;color:var(--tpl-muted)}.content-grid,.timeline{display:grid;gap:14px;margin-top:18px}.content-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.content-item{display:grid;gap:6px}.content-item strong,.chapter-no{font-size:30px;font-weight:800;color:var(--tpl-accent-strong)}.timeline{grid-template-columns:repeat(4,minmax(0,1fr))}.timeline-item{display:grid;gap:8px}.timeline-dot{width:14px;height:14px;border-radius:50%;background:var(--tpl-accent-strong);box-shadow:0 0 0 6px var(--tpl-accent-soft)}.studio-panel{position:relative;display:flex;flex-direction:column;gap:18px}.close-btn{position:absolute;top:14px;right:14px;width:40px;height:40px;border:none;border-radius:999px;background:rgba(15,23,42,.05);font-size:28px;cursor:pointer}.studio-box{padding:18px;border-radius:22px;background:#fff;border:1px solid rgba(226,232,240,.9)}.compact-tools .tool-select{flex:1 1 0;min-width:0}.studio-meta,.result-card{padding:16px;border-radius:20px;background:rgba(248,250,252,.92);border:1px solid rgba(226,232,240,.86)}.ribbons span{position:absolute;border-radius:999px;background:linear-gradient(180deg,var(--tpl-accent) 0%,var(--tpl-accent-strong) 100%);opacity:.72}.ribbons span:nth-child(1){width:36%;height:130%;right:10%;top:-18%;transform:rotate(42deg)}.ribbons span:nth-child(2){width:28%;height:120%;right:0;top:-6%;transform:rotate(42deg)}.ribbons span:nth-child(3){width:22%;height:90%;right:22%;bottom:-16%;transform:rotate(42deg)}@media (max-width:1280px){.studio{grid-template-columns:100px minmax(0,1fr)}.studio-panel{grid-column:1/-1}}@media (max-width:1180px){.layout,.template-grid,.summary-grid,.slide-grid{grid-template-columns:1fr}.rail{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}.rail-item{min-width:120px}.studio{grid-template-columns:1fr}.studio-list{flex-direction:row}.studio-item{min-width:110px}.timeline{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:720px){.ai-page{padding:16px}.head h2{font-size:30px}.mode-switch,.mode-switch.compact{width:100%;justify-content:center;flex-wrap:wrap}.composer-top,.section-head,.toolbar,.upload-box,.upload-actions,.result-actions,.row{flex-direction:column;align-items:flex-start}.tool-select,.primary-btn,.ghost-btn,.primary-btn.full{width:100%;margin-left:0}.cover{min-height:260px;padding:28px}.cover-copy{left:24px;top:30px}.cover-copy h2{font-size:42px}.watermark{font-size:54px;left:22px}.timeline,.content-grid{grid-template-columns:1fr}}
</style>
