<template>
  <div class="type-safety-page">
    <div class="page-header">
      <h1>🔒 TypeScript类型安全演示</h1>
      <p>完整的类型定义和类型检查</p>
    </div>

    <div class="demo-sections">
      <!-- 类型安全的表单 -->
      <div class="demo-section">
        <h2>类型安全的表单组件</h2>
        <div class="form-container">
          <el-form ref="formRef" :model="userForm" :rules="formRules" label-width="120px">
            <el-form-item label="用户名" prop="username">
              <el-input
                v-model="userForm.username"
                placeholder="请输入用户名"
                clearable
              />
            </el-form-item>

            <el-form-item label="邮箱" prop="email">
              <el-input
                v-model="userForm.email"
                placeholder="请输入邮箱"
                clearable
              />
            </el-form-item>

            <el-form-item label="年龄" prop="age">
              <el-input-number
                v-model="userForm.age"
                :min="18"
                :max="100"
                controls-position="right"
              />
            </el-form-item>

            <el-form-item label="部门" prop="department">
              <el-select v-model="userForm.department" placeholder="请选择部门">
                <el-option
                  v-for="dept in departments"
                  :key="dept.value"
                  :label="dept.label"
                  :value="dept.value"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="技能" prop="skills">
              <el-checkbox-group v-model="userForm.skills">
                <el-checkbox
                  v-for="skill in availableSkills"
                  :key="skill"
                  :value="skill"
                >
                  {{ skill }}
                </el-checkbox>
              </el-checkbox-group>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="submitForm">提交表单</el-button>
              <el-button @click="resetForm">重置表单</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>

      <!-- 类型安全的数据展示 -->
      <div class="demo-section">
        <h2>类型安全的数据表格</h2>
        <div class="table-container">
          <el-table :data="userList" style="width: 100%" stripe>
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="username" label="用户名" width="120" />
            <el-table-column prop="email" label="邮箱" width="200" />
            <el-table-column prop="age" label="年龄" width="80" />
            <el-table-column prop="department" label="部门" width="120">
              <template #default="scope">
                {{ getDepartmentLabel(scope.row.department) }}
              </template>
            </el-table-column>
            <el-table-column prop="skills" label="技能">
              <template #default="scope">
                <el-tag
                  v-for="skill in scope.row.skills"
                  :key="skill"
                  size="small"
                  style="margin-right: 5px"
                >
                  {{ skill }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="scope">
                <el-button size="small" @click="editUser(scope.row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 类型安全的API调用 -->
      <div class="demo-section">
        <h2>类型安全的API调用</h2>
        <div class="api-container">
          <div class="api-buttons">
            <el-button type="primary" :loading="apiLoading" @click="fetchUsers">
              获取用户列表
            </el-button>
            <el-button type="success" :loading="apiLoading" @click="createUser">
              创建新用户
            </el-button>
            <el-button type="warning" :loading="apiLoading" @click="updateUser">
              更新用户
            </el-button>
          </div>

          <div v-if="apiResult" class="api-result">
            <h4>API响应结果:</h4>
            <pre>{{ JSON.stringify(apiResult, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>

    <div class="actions">
      <el-button size="large" @click="goBack">
        ← 返回首页
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

// 类型定义
interface User {
  id: number
  username: string
  email: string
  age: number
  department: string
  skills: string[]
}

interface UserForm {
  username: string
  email: string
  age: number
  department: string
  skills: string[]
}

interface Department {
  value: string
  label: string
}

interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
}

// 表单引用
const formRef = ref()

// 表单数据
const userForm = reactive<UserForm>({
  username: '',
  email: '',
  age: 25,
  department: '',
  skills: []
})

// 表单验证规则
const formRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  department: [
    { required: true, message: '请选择部门', trigger: 'change' }
  ]
}

// 部门选项
const departments: Department[] = [
  { value: 'tech', label: '技术部' },
  { value: 'product', label: '产品部' },
  { value: 'design', label: '设计部' },
  { value: 'ops', label: '运维部' }
]

// 可用技能
const availableSkills = ['JavaScript', 'TypeScript', 'Vue.js', 'React', 'Node.js', 'Python']

// 用户列表
const userList = ref<User[]>([
  {
    id: 1,
    username: 'zhangsan',
    email: 'zhangsan@example.com',
    age: 28,
    department: 'tech',
    skills: ['JavaScript', 'TypeScript', 'Vue.js']
  },
  {
    id: 2,
    username: 'lisi',
    email: 'lisi@example.com',
    age: 32,
    department: 'product',
    skills: ['JavaScript', 'React', 'Node.js']
  }
])

// API相关状态
const apiLoading = ref(false)
const apiResult = ref<any>(null)

const router = useRouter()

// 计算属性
const getDepartmentLabel = (value: string): string => {
  const dept = departments.find(d => d.value === value)
  return dept ? dept.label : value
}

// 方法
const submitForm = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    const newUser: User = {
      id: Date.now(),
      ...userForm
    }
    userList.value.push(newUser)

    ElMessage.success('用户创建成功！' as any)
    resetForm()
  } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
    ElMessage.error('表单验证失败' as any)
  }
}

const resetForm = () => {
  if (formRef.value) {
    formRef.value.resetFields()
  }
  Object.assign(userForm, {
    username: '',
    email: '',
    age: 25,
    department: '',
    skills: []
  })
}

const editUser = (user: User) => {
  ElMessageBox.confirm(
    `确定要编辑用户 ${user.username} 吗？`,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    // 这里可以实现编辑逻辑
    ElMessage.info('编辑功能开发中...' as any)
  })
}

// 类型安全的API模拟
const fetchUsers = async () => {
  apiLoading.value = true
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000))

    const response: ApiResponse<User[]> = {
      success: true,
      data: userList.value,
      message: '获取用户列表成功'
    }

    apiResult.value = response
    ElMessage.success('获取用户列表成功' as any)
  } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
    apiResult.value = { error: '获取失败' }
    ElMessage.error('获取用户列表失败' as any)
  } finally {
    apiLoading.value = false
  }
}

const createUser = async () => {
  apiLoading.value = true
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000))

    const newUser: User = {
      id: Date.now(),
      username: 'newuser',
      email: 'newuser@example.com',
      age: 25,
      department: 'tech',
      skills: ['JavaScript']
    }

    const response: ApiResponse<User> = {
      success: true,
      data: newUser,
      message: '创建用户成功'
    }

    apiResult.value = response
    userList.value.push(newUser)
    ElMessage.success('创建用户成功' as any)
  } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
    apiResult.value = { error: '创建失败' }
    ElMessage.error('创建用户失败' as any)
  } finally {
    apiLoading.value = false
  }
}

const updateUser = async () => {
  apiLoading.value = true
  try {
    // 模拟API调用
    await new Promise(resolve => setTimeout(resolve, 1000))

    const updatedUser: Partial<User> = {
      age: 30,
      skills: ['JavaScript', 'TypeScript', 'Vue.js', 'Node.js']
    }

    const response: ApiResponse<Partial<User>> = {
      success: true,
      data: updatedUser,
      message: '更新用户成功'
    }

    apiResult.value = response
    ElMessage.success('更新用户成功' as any)
  } catch (_error) { // eslint-disable-line @typescript-eslint/no-unused-vars
    apiResult.value = { error: '更新失败' }
    ElMessage.error('更新用户失败' as any)
  } finally {
    apiLoading.value = false
  }
}

const goBack = () => {
  router.push('/')
}
</script>

<style scoped>
.type-safety-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 2rem;
}

.page-header {
  text-align: center;
  margin-bottom: 3rem;
}

.page-header h1 {
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.page-header p {
  font-size: 1.1rem;
  color: #7f8c8d;
}

.demo-sections {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-bottom: 3rem;
}

.demo-section {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
}

.demo-section h2 {
  color: #2c3e50;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
}

.form-container {
  max-width: 600px;
}

.table-container {
  margin-top: 1rem;
}

.api-container {
  margin-top: 1rem;
}

.api-buttons {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.api-result {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #e9ecef;
}

.api-result h4 {
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.api-result pre {
  background: #ffffff;
  padding: 1rem;
  border-radius: 4px;
  border: 1px solid #dee2e6;
  font-size: 0.9rem;
  overflow-x: auto;
}

.actions {
  text-align: center;
  margin-top: 2rem;
}
</style>