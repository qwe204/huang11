<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-header">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" class="auth-logo">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <h2>文档管理组件</h2>
        <p class="auth-subtitle">{{ isLogin ? '登录账号' : '注册新账号' }}</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleSubmit">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" size="large" clearable />
        </el-form-item>

        <template v-if="!isLogin">
          <el-form-item label="昵称" prop="nickname">
            <el-input v-model="form.nickname" placeholder="请输入昵称" size="large" clearable />
          </el-form-item>
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" placeholder="请输入邮箱（选填）" size="large" clearable />
          </el-form-item>
        </template>

        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="请输入密码" size="large" show-password />
        </el-form-item>

        <template v-if="!isLogin">
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input v-model="form.confirmPassword" type="password" placeholder="请再次输入密码" size="large" show-password />
          </el-form-item>
        </template>

        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" style="width: 100%" native-type="submit">
            {{ isLogin ? '登 录' : '注 册' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="auth-footer">
        <template v-if="isLogin">
          还没有账号？<a href="#" @click.prevent="isLogin = false">立即注册</a>
        </template>
        <template v-else>
          已有账号？<a href="#" @click.prevent="isLogin = true">立即登录</a>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'LoginPage',
}
</script>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { authApi } from '../services/api'

const emit = defineEmits<{
  success: [data: { token: string; user: any }]
}>()

const isLogin = ref(true)
const loading = ref(false)
const formRef = ref<FormInstance>()

const form = reactive({
  username: '',
  password: '',
  nickname: '',
  email: '',
  confirmPassword: '',
})

const validateConfirm = (_rule: any, value: string, callback: any) => {
  if (!isLogin.value && value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules = computed<FormRules>(() => ({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 个字符', trigger: 'blur' },
  ],
  confirmPassword: isLogin.value ? [] : [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
  nickname: isLogin.value ? [] : [
    { max: 20, message: '昵称最多 20 个字符', trigger: 'blur' },
  ],
}))

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    let res
    if (isLogin.value) {
      res = await authApi.login(form.username, form.password)
    } else {
      res = await authApi.register({
        username: form.username,
        password: form.password,
        nickname: form.nickname || undefined,
        email: form.email || undefined,
      })
    }

    localStorage.setItem('token', res.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.user))

    ElMessage.success(isLogin.value ? '登录成功' : '注册成功')
    emit('success', res.data)
  } catch (err: any) {
    ElMessage.error(err.message || '操作失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 8% 18%, rgba(15, 118, 110, 0.2), transparent 28%),
    radial-gradient(circle at 94% 8%, rgba(56, 189, 248, 0.18), transparent 34%),
    radial-gradient(circle at 86% 86%, rgba(249, 115, 22, 0.15), transparent 30%),
    linear-gradient(145deg, #f7fbff 0%, #eff6fb 100%);
  padding: 24px;
}

.auth-card {
  width: min(460px, 100%);
  padding: 38px 34px 30px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 24px;
  box-shadow: var(--dp-shadow-lg);
  backdrop-filter: blur(12px);
  animation: rise-in 420ms ease;
}

.auth-header {
  text-align: center;
  margin-bottom: 28px;
}

.auth-logo {
  color: var(--dp-primary, #0f766e);
  margin-bottom: 12px;
  filter: drop-shadow(0 8px 14px rgba(15, 118, 110, 0.2));
}

.auth-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: var(--dp-text, #1e293b);
  margin-bottom: 8px;
  letter-spacing: 0.02em;
}

.auth-subtitle {
  font-size: 14px;
  color: var(--dp-text-secondary, #64748b);
}

.auth-footer {
  text-align: center;
  font-size: 14px;
  color: var(--dp-text-secondary, #64748b);
  margin-top: 8px;
}

.auth-footer a {
  color: var(--dp-primary, #0d9488);
  text-decoration: none;
  font-weight: 500;
}

.auth-footer a:hover {
  text-decoration: underline;
}

@media (max-width: 720px) {
  .auth-page {
    padding: 14px;
  }

  .auth-card {
    padding: 30px 20px 22px;
    border-radius: 18px;
  }
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
