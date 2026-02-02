<template>
  <div class="login-container">
    <div class="login-card">
      <h1>SPARK 系统登录</h1>
      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="rules"
        label-width="0"
        class="login-form"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="用户名"
            size="large"
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-button"
            @click="handleLogin"
          >
            {{ loading ? '登录中...' : '登录' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-tip">
        <p>开发环境 Mock 登录：任意用户名密码</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance } from 'element-plus'
import { authService } from '@spark-view/spark-app'

const router = useRouter()
const route = useRoute()

// 避免未使用警告
void router
void route

const loginFormRef = ref<FormInstance>()
const loading = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

async function handleLogin() {
  if (!loginFormRef.value) return

  try {
    await loginFormRef.value.validate()
    loading.value = true

    await authService.login({
      username: loginForm.username,
      password: loginForm.password
    })

    ElMessage.success('登录成功')

    const redirect = (route.query.redirect as string) || '/'
    window.location.href = redirect

  } catch (error) {
    ElMessage.error('登录失败：' + (error as Error).message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.login-card h1 {
  margin-bottom: 30px;
  text-align: center;
  font-size: 24px;
  color: #333;
}

.login-form {
  margin-bottom: 20px;
}

.login-button {
  width: 100%;
}

.login-tip {
  text-align: center;
  font-size: 13px;
  color: #999;
}
</style>
