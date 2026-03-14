<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">SPARK 管理平台</h1>
      <p class="login-subtitle">配置驱动，零代码</p>

      <el-tabs v-model="activeTab" class="login-tabs">
        <!-- ── 登录 ── -->
        <el-tab-pane label="登录" name="login">
          <el-form
            ref="loginFormRef"
            :model="loginForm"
            :rules="loginRules"
            label-width="0"
            @submit.prevent="handleLogin"
          >
            <el-form-item prop="tenantId">
              <el-input v-model="loginForm.tenantId" placeholder="租户 ID" prefix-icon="el-icon-office-building">
                <template #prefix><span class="input-icon">🏢</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="username">
              <el-input v-model="loginForm.username" placeholder="用户名">
                <template #prefix><span class="input-icon">👤</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="password">
              <el-input v-model="loginForm.password" type="password" show-password placeholder="密码" @keyup.enter="handleLogin">
                <template #prefix><span class="input-icon">🔒</span></template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <div class="btn-group">
                <el-button type="primary" class="login-btn" :loading="loading" @click="handleLogin">登 录</el-button>
                <el-button class="cancel-btn" @click="goHome">取 消</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ── 注册用户 ── -->
        <el-tab-pane label="注册" name="register">
          <el-form
            ref="regFormRef"
            :model="regForm"
            :rules="regRules"
            label-width="0"
            @submit.prevent="handleRegister"
          >
            <el-form-item prop="tenantId">
              <el-input v-model="regForm.tenantId" placeholder="租户 ID">
                <template #prefix><span class="input-icon">🏢</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="username">
              <el-input v-model="regForm.username" placeholder="用户名">
                <template #prefix><span class="input-icon">👤</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="displayName">
              <el-input v-model="regForm.displayName" placeholder="显示名称（选填）">
                <template #prefix><span class="input-icon">📝</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="email">
              <el-input v-model="regForm.email" placeholder="邮箱（选填）">
                <template #prefix><span class="input-icon">📧</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="password">
              <el-input v-model="regForm.password" type="password" show-password placeholder="密码">
                <template #prefix><span class="input-icon">🔒</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="confirmPassword">
              <el-input v-model="regForm.confirmPassword" type="password" show-password placeholder="确认密码" @keyup.enter="handleRegister">
                <template #prefix><span class="input-icon">🔒</span></template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <div class="btn-group">
                <el-button type="primary" class="login-btn" :loading="loading" @click="handleRegister">注 册</el-button>
                <el-button class="cancel-btn" @click="goHome">取 消</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ── 注册租户 ── -->
        <el-tab-pane label="注册租户" name="register-tenant">
          <el-form
            ref="tenantFormRef"
            :model="tenantForm"
            :rules="tenantRules"
            label-width="0"
            @submit.prevent="handleRegisterTenant"
          >
            <el-form-item prop="tenantId">
              <el-input v-model="tenantForm.tenantId" placeholder="租户 ID（英文标识）">
                <template #prefix><span class="input-icon">🆔</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="tenantName">
              <el-input v-model="tenantForm.tenantName" placeholder="租户名称">
                <template #prefix><span class="input-icon">🏢</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="username">
              <el-input v-model="tenantForm.username" placeholder="管理员用户名">
                <template #prefix><span class="input-icon">👤</span></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="password">
              <el-input v-model="tenantForm.password" type="password" show-password placeholder="管理员密码" @keyup.enter="handleRegisterTenant">
                <template #prefix><span class="input-icon">🔒</span></template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <div class="btn-group">
                <el-button type="primary" class="login-btn" :loading="loading" @click="handleRegisterTenant">注册租户</el-button>
                <el-button class="cancel-btn" @click="goHome">取 消</el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { login, register, registerTenant } from '@/services/auth'
import { refreshRoutes } from '@/services/ai-loop'
import type { FormInstance, FormRules } from 'element-plus'

const router = useRouter()
const savedTab = sessionStorage.getItem('spark_login_tab')
const activeTab = ref(savedTab ?? 'login')
if (savedTab) sessionStorage.removeItem('spark_login_tab')
const loading = ref(false)
const errorMsg = ref('')

function goHome() {
  void router.replace('/')
}

// ── 登录表单 ────────────────────────────────────────────────────────────────

const loginForm = reactive({ tenantId: 'lmspark', username: '', password: '' })
const loginFormRef = ref<FormInstance>()
const loginRules: FormRules = {
  tenantId: [{ required: true, message: '请输入租户 ID', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  errorMsg.value = ''
  try {
    const user = await login(loginForm)
    await refreshRoutes()
    await router.replace(`/t/${user.tenantId}/dashboard`)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '登录失败'
  } finally {
    loading.value = false
  }
}

// ── 注册表单 ────────────────────────────────────────────────────────────────

const regForm = reactive({ tenantId: 'lmspark', username: '', password: '', confirmPassword: '', displayName: '', email: '' })
const regFormRef = ref<FormInstance>()
const regRules: FormRules = {
  tenantId: [{ required: true, message: '请输入租户 ID', trigger: 'blur' }],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 6, message: '密码至少 6 位', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (err?: Error) => void) => {
        if (value !== regForm.password) callback(new Error('两次密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

async function handleRegister() {
  const valid = await regFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  errorMsg.value = ''
  try {
    const user = await register(regForm)
    await router.replace(`/t/${user.tenantId}/dashboard`)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    loading.value = false
  }
}

// ── 注册租户表单 ────────────────────────────────────────────────────────────

const tenantForm = reactive({ tenantId: '', tenantName: '', username: 'admin', password: '' })
const tenantFormRef = ref<FormInstance>()
const tenantRules: FormRules = {
  tenantId: [
    { required: true, message: '请输入租户 ID', trigger: 'blur' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/, message: '以字母开头，3-32 个字母/数字/_/-', trigger: 'blur' },
  ],
  tenantName: [{ required: true, message: '请输入租户名称', trigger: 'blur' }],
  username: [{ required: true, message: '请输入管理员用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入管理员密码', trigger: 'blur' }, { min: 6, message: '密码至少 6 位', trigger: 'blur' }],
}

async function handleRegisterTenant() {
  const valid = await tenantFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  errorMsg.value = ''
  try {
    const user = await registerTenant(tenantForm)
    await router.replace(`/t/${user.tenantId}/dashboard`)
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : '租户注册失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 420px;
  padding: 40px 36px 28px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.login-title {
  text-align: center;
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 4px;
}

.login-subtitle {
  text-align: center;
  font-size: 14px;
  color: #909399;
  margin: 0 0 24px;
}

.login-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

.login-btn {
  width: 100%;
  height: 42px;
  font-size: 16px;
}

.btn-group {
  display: flex;
  gap: 12px;
  width: 100%;
}

.btn-group .login-btn {
  flex: 1;
}

.cancel-btn {
  height: 42px;
  font-size: 16px;
}

.login-error {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  color: #f56c6c;
  font-size: 13px;
  text-align: center;
}

.input-icon {
  font-size: 14px;
  line-height: 1;
}

/* 暗黑模式 */
html.dark .login-page {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

html.dark .login-card {
  background: #1d1e1f;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

html.dark .login-title {
  color: #e5eaf3;
}
</style>
