<template>
  <div class="app-container">
    <LoginPage v-if="!isLoggedIn" @success="handleLoginSuccess" />

    <template v-else>
      <header class="app-header">
        <div class="header-left">
          <svg class="logo-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <h1 class="app-title">文档管理组件</h1>
          <el-tag type="success" size="small" effect="plain">银河麒麟兼容</el-tag>
        </div>

        <div class="header-center">
          <el-menu
            mode="horizontal"
            :default-active="currentView"
            @select="handleMenuSelect"
            :ellipsis="false"
            class="nav-menu"
          >
            <el-menu-item index="files">
              <el-icon><Document /></el-icon>
              <span>文档管理</span>
            </el-menu-item>
            <el-menu-item index="ai">
              <el-icon><Connection /></el-icon>
              <span>AI 功能集成</span>
            </el-menu-item>
            <el-menu-item v-if="isAdmin" index="users">
              <el-icon><User /></el-icon>
              <span>用户管理</span>
            </el-menu-item>
          </el-menu>
        </div>

        <div class="header-right">
          <el-dropdown trigger="click" @command="handleUserCommand">
            <div class="user-info">
              <el-avatar :size="32" class="user-avatar">
                {{ (currentUser?.nickname || currentUser?.username || '?').charAt(0) }}
              </el-avatar>
              <span class="user-name">{{ currentUser?.nickname || currentUser?.username }}</span>
              <el-icon style="margin-left: 4px"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <el-tag size="small" :type="isAdmin ? 'danger' : ''" effect="plain" style="margin-right: 8px">
                    {{ isAdmin ? '管理员' : '用户' }}
                  </el-tag>
                  {{ currentUser?.username }}
                </el-dropdown-item>
                <el-dropdown-item divided command="changePwd">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="app-main">
        <template v-if="currentView === 'files'">
          <template v-if="!previewFile">
            <FileManager @preview="handlePreview" />
          </template>
          <template v-else>
            <DocViewer :file="previewFile" @back="previewFile = null" />
          </template>
        </template>

        <template v-if="currentView === 'ai'">
          <AiIntegrationPage
            @go-files="handleMenuSelect('files')"
            @preview-file="handlePreviewFromAi"
          />
        </template>

        <template v-if="currentView === 'users' && isAdmin">
          <UserManagement />
        </template>
      </main>
    </template>

    <el-dialog v-model="pwdDialogVisible" title="修改密码" width="400px">
      <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="80px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="pwdForm.newPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="handleChangePwd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
export default {
  name: 'App',
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, Connection, Document, User } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { FileInfo, UserInfo } from './services/api'
import { authApi } from './services/api'
import AiIntegrationPage from './components/AiIntegrationPage.vue'
import DocViewer from './components/DocViewer.vue'
import FileManager from './components/FileManager.vue'
import LoginPage from './components/LoginPage.vue'
import UserManagement from './components/UserManagement.vue'

const currentUser = ref<UserInfo | null>(null)
const isLoggedIn = ref(false)
const currentView = ref('files')
const previewFile = ref<FileInfo | null>(null)

const isAdmin = computed(() => currentUser.value?.role === 'admin')

const pwdDialogVisible = ref(false)
const pwdLoading = ref(false)
const pwdFormRef = ref<FormInstance>()
const pwdForm = reactive({ oldPassword: '', newPassword: '' })
const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 个字符', trigger: 'blur' },
  ],
}

function checkAuth() {
  const token = localStorage.getItem('token')
  const user = localStorage.getItem('user')

  if (token && user) {
    try {
      currentUser.value = JSON.parse(user)
      isLoggedIn.value = true
    } catch {
      logout()
    }
  }
}

function handleLoginSuccess(data: { token: string; user: UserInfo }) {
  currentUser.value = data.user
  isLoggedIn.value = true
}

function handleMenuSelect(index: string) {
  currentView.value = index
  previewFile.value = null
}

function handlePreview(file: FileInfo) {
  previewFile.value = file
}

function handlePreviewFromAi(file: FileInfo) {
  currentView.value = 'files'
  previewFile.value = file
}

function handleUserCommand(cmd: string) {
  if (cmd === 'changePwd') {
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdDialogVisible.value = true
    return
  }

  if (cmd === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'info' })
      .then(() => logout())
      .catch(() => {})
  }
}

async function handleChangePwd() {
  const valid = await pwdFormRef.value?.validate().catch(() => false)
  if (!valid) return

  pwdLoading.value = true
  try {
    await authApi.changePassword(pwdForm.oldPassword, pwdForm.newPassword)
    ElMessage.success('密码修改成功，请重新登录')
    pwdDialogVisible.value = false
    logout()
  } catch (err: any) {
    ElMessage.error(err.message || '修改失败')
  } finally {
    pwdLoading.value = false
  }
}

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  currentUser.value = null
  isLoggedIn.value = false
  currentView.value = 'files'
  previewFile.value = null
}

function onAuthLogout() {
  logout()
}

onMounted(() => {
  checkAuth()
  window.addEventListener('auth:logout', onAuthLogout)
})

onBeforeUnmount(() => {
  window.removeEventListener('auth:logout', onAuthLogout)
})
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.app-header {
  height: var(--dp-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  margin: 12px 12px 0;
  border-radius: var(--dp-radius-lg);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: var(--dp-shadow-sm);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  color: var(--dp-primary);
  filter: drop-shadow(0 2px 6px rgba(20, 184, 166, 0.28));
}

.app-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--dp-text);
}

.header-center {
  display: flex;
  align-items: center;
}

.nav-menu {
  border-bottom: none !important;
  height: var(--dp-header-height);
  background: transparent !important;
}

.nav-menu .el-menu-item {
  height: 40px;
  line-height: 40px;
  border-radius: 999px;
  margin: 0 4px;
  transition: all var(--dp-transition);
}

.nav-menu .el-menu-item.is-active {
  background: rgba(20, 184, 166, 0.14) !important;
  color: var(--dp-primary-dark) !important;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 999px;
  transition: all var(--dp-transition);
  border: 1px solid transparent;
}

.user-info:hover {
  background: rgba(20, 184, 166, 0.1);
  border-color: rgba(20, 184, 166, 0.2);
}

.user-avatar {
  background: var(--dp-gradient-main);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--dp-text);
}

.app-main {
  flex: 1;
  overflow: hidden;
  margin: 12px;
  border-radius: var(--dp-radius-lg);
  border: 1px solid rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(10px);
  box-shadow: var(--dp-shadow-md);
}

@media (max-width: 980px) {
  .app-header {
    padding: 0 14px;
    margin: 8px 8px 0;
  }

  .app-title {
    display: none;
  }

  .header-center {
    flex: 1;
    overflow-x: auto;
    padding: 0 8px;
  }

  .user-name {
    display: none;
  }

  .app-main {
    margin: 8px;
  }
}
</style>
