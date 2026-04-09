<template>
  <div class="user-management">
    <div class="management-toolbar">
      <div class="toolbar-left">
        <el-input v-model="keyword" placeholder="搜索用户名/昵称..." clearable style="width: 260px" @input="debouncedSearch">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="roleFilter" placeholder="角色" clearable style="width: 120px" @change="loadUsers">
          <el-option label="管理员" value="admin" />
          <el-option label="普通用户" value="user" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="showAddDialog">
          <el-icon style="margin-right: 6px"><Plus /></el-icon>
          添加用户
        </el-button>
      </div>
    </div>

    <div class="table-wrapper">
      <el-table v-loading="loading" :data="users" stripe style="width: 100%" empty-text="暂无用户">
        <el-table-column label="ID" width="70" prop="id" />
        <el-table-column label="用户名" width="140" prop="username" />
        <el-table-column label="昵称" width="140" prop="nickname" />
        <el-table-column label="邮箱" min-width="200" prop="email">
          <template #default="{ row }">{{ row.email || '-' }}</template>
        </el-table-column>
        <el-table-column label="角色" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : ''" size="small" effect="plain">
              {{ row.role === 'admin' ? '管理员' : '用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="plain">
              {{ row.status === 1 ? '正常' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="180" prop="created_at" />
        <el-table-column label="操作" width="240" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="showEditDialog(row)">编辑</el-button>
            <el-button type="warning" link size="small" @click="handleResetPwd(row)">重置密码</el-button>
            <el-button
              v-if="row.username !== 'admin'"
              type="danger" link size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper" v-if="total > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadUsers"
        />
      </div>
    </div>

    <!-- 添加/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingUser ? '编辑用户' : '添加用户'" width="480px" @close="resetForm">
      <el-form ref="userFormRef" :model="userForm" :rules="userRules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="userForm.username" :disabled="!!editingUser" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item v-if="!editingUser" label="密码" prop="password">
          <el-input v-model="userForm.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="userForm.nickname" placeholder="请输入昵称" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="userForm.email" placeholder="请输入邮箱" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="userForm.role" style="width: 100%">
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editingUser" label="状态">
          <el-switch v-model="userForm.statusBool" active-text="正常" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts">
export default {
  name: 'UserManagement',
}
</script>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { adminApi } from '../services/api'
import type { UserInfo } from '../services/api'

const users = ref<UserInfo[]>([])
const loading = ref(false)
const keyword = ref('')
const roleFilter = ref('')
const currentPage = ref(1)
const pageSize = 20
const total = ref(0)

const dialogVisible = ref(false)
const editingUser = ref<UserInfo | null>(null)
const submitting = ref(false)
const userFormRef = ref<FormInstance>()

const userForm = reactive({
  username: '',
  password: '',
  nickname: '',
  email: '',
  role: 'user',
  statusBool: true,
})

const userRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 个字符', trigger: 'blur' },
  ],
}

let searchTimer: ReturnType<typeof setTimeout>

function debouncedSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
    loadUsers()
  }, 300)
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await adminApi.listUsers({
      page: currentPage.value,
      size: pageSize,
      keyword: keyword.value,
      role: roleFilter.value,
    })
    users.value = res.data.records
    total.value = res.data.total
  } catch (err: any) {
    ElMessage.error(err.message || '加载用户列表失败')
  } finally {
    loading.value = false
  }
}

function showAddDialog() {
  editingUser.value = null
  resetForm()
  dialogVisible.value = true
}

function showEditDialog(user: UserInfo) {
  editingUser.value = user
  Object.assign(userForm, {
    username: user.username,
    password: '',
    nickname: user.nickname,
    email: user.email || '',
    role: user.role,
    statusBool: user.status === 1,
  })
  dialogVisible.value = true
}

function resetForm() {
  Object.assign(userForm, { username: '', password: '', nickname: '', email: '', role: 'user', statusBool: true })
  userFormRef.value?.clearValidate()
}

async function handleSubmit() {
  if (!editingUser.value) {
    const valid = await userFormRef.value?.validate().catch(() => false)
    if (!valid) return
  }

  submitting.value = true
  try {
    if (editingUser.value) {
      await adminApi.updateUser(editingUser.value.id, {
        nickname: userForm.nickname,
        email: userForm.email || undefined,
        role: userForm.role,
        status: userForm.statusBool ? 1 : 0,
      })
      ElMessage.success('更新成功')
    } else {
      await adminApi.createUser({
        username: userForm.username,
        password: userForm.password,
        nickname: userForm.nickname || undefined,
        email: userForm.email || undefined,
        role: userForm.role,
      })
      ElMessage.success('创建成功')
    }
    dialogVisible.value = false
    loadUsers()
  } catch (err: any) {
    ElMessage.error(err.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function handleResetPwd(user: UserInfo) {
  try {
    const { value } = await ElMessageBox.prompt(`重置用户「${user.username}」的密码`, '重置密码', {
      inputPlaceholder: '请输入新密码（至少6位）',
      inputType: 'password',
      inputValidator: (v: string) => (!v || v.length < 6 ? '密码至少 6 个字符' : true),
    })
    await adminApi.resetPassword(user.id, value)
    ElMessage.success('密码重置成功')
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err.message || '重置失败')
  }
}

async function handleDelete(user: UserInfo) {
  try {
    await ElMessageBox.confirm(`确定要删除用户「${user.username}」吗？`, '删除确认', {
      type: 'warning',
    })
    await adminApi.deleteUser(user.id)
    ElMessage.success('删除成功')
    loadUsers()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err.message || '删除失败')
  }
}

onMounted(loadUsers)
</script>

<style scoped>
.user-management {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.management-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--dp-border-light, #f1f5f9);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.table-wrapper {
  flex: 1;
  overflow: auto;
  padding: 0 24px;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0;
}
</style>
