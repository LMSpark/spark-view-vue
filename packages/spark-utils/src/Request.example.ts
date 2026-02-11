/**
 * 统一请求层使用示例
 */

import { 
  createRequest, 
  getDefaultRequest
} from '@spark-view/spark-utils'
import {
  createAuthInterceptor,
  createTenantInterceptor,
  createStandardApiInterceptor,
  createRequestLogInterceptor,
  createResponseLogInterceptor,
  createErrorTransformInterceptor,
  createRedirectInterceptor
} from '@spark-view/spark-utils'

/* -----------------------------------------------------------------------------
 * 示例 1: 基本使用
 * -------------------------------------------------------------------------- */

async function basicUsage() {
  // 创建请求实例
  const request = createRequest({
    baseURL: '/api',
    timeout: 10000
  })
  
  // GET 请求
  interface User {
    id: number
    name: string
  }
  
  const users = await request.get<User[]>('/users')
  console.log('用户列表:', users)
  
  // POST 请求
  const newUser = await request.post<User>('/users', {
    name: 'John Doe'
  })
  console.log('新用户:', newUser)
  
  // PUT 请求
  const updatedUser = await request.put<User>('/users/1', {
    name: 'Jane Doe'
  })
  console.log('更新用户:', updatedUser)
  
  // DELETE 请求
  await request.delete('/users/1')
  console.log('用户已删除')
}

/* -----------------------------------------------------------------------------
 * 示例 2: 带查询参数的请求
 * -------------------------------------------------------------------------- */

async function requestWithParams() {
  const request = createRequest({ baseURL: '/api' })
  
  // GET 请求带查询参数
  const users = await request.get('/users', {
    page: 1,
    pageSize: 10,
    status: 'active'
  })
  // 实际请求: GET /api/users?page=1&pageSize=10&status=active
  
  console.log('用户列表:', users)
}

/* -----------------------------------------------------------------------------
 * 示例 3: 使用拦截器
 * -------------------------------------------------------------------------- */

function setupInterceptors() {
  const request = createRequest({ baseURL: '/api' })
  
  // 添加认证拦截器
  request.interceptors.request.use(
    createAuthInterceptor(() => localStorage.getItem('token'))
  )
  
  // 添加租户 ID 拦截器
  request.interceptors.request.use(
    createTenantInterceptor(() => 'tenant-123')
  )
  
  // 添加请求日志
  request.interceptors.request.use(
    createRequestLogInterceptor({ logHeaders: true })
  )
  
  // 添加标准 API 响应处理
  request.interceptors.response.use(
    createStandardApiInterceptor({
      successCodes: [0, 200],
      errorHandler: (code, message) => {
        console.error(`API 错误 ${code}: ${message}`)
      }
    })
  )
  
  // 添加响应日志
  request.interceptors.response.use(
    createResponseLogInterceptor()
  )
  
  // 添加错误转换
  request.interceptors.response.use(
    createErrorTransformInterceptor()
  )
  
  // 添加 401 重定向
  request.interceptors.response.use(
    createRedirectInterceptor({
      onUnauthorized: () => {
        console.log('未授权，跳转登录')
        window.location.href = '/login'
      }
    })
  )
  
  return request
}

/* -----------------------------------------------------------------------------
 * 示例 4: 自定义拦截器
 * -------------------------------------------------------------------------- */

function customInterceptors() {
  const request = createRequest({ baseURL: '/api' })
  
  // 自定义请求拦截器
  request.interceptors.request.use({
    name: 'CustomRequestInterceptor',
    onRequest: (config) => {
      // 添加自定义逻辑
      console.log('发起请求:', config.url)
      
      // 添加自定义请求头
      config.headers = config.headers || {}
      config.headers['X-Request-Id'] = Math.random().toString(36).slice(2)
      
      return config
    },
    onRequestError: (error) => {
      console.error('请求失败:', error)
    }
  })
  
  // 自定义响应拦截器
  request.interceptors.response.use({
    name: 'CustomResponseInterceptor',
    onResponse: (response) => {
      // 处理响应
      console.log('收到响应:', response.status)
      
      // 可以修改响应数据
      if (Array.isArray(response.data)) {
        console.log('响应是数组，长度:', response.data.length)
      }
      
      return response
    },
    onResponseError: (error) => {
      console.error('响应错误:', error.message)
      return error
    }
  })
  
  return request
}

/* -----------------------------------------------------------------------------
 * 示例 5: 缓存请求
 * -------------------------------------------------------------------------- */

async function cachedRequests() {
  const request = createRequest({ baseURL: '/api' })
  
  // 启用缓存的 GET 请求
  const users1 = await request.get('/users', {}, {
    cache: true,
    cacheExpiry: 300000  // 缓存 5 分钟
  })
  console.log('首次请求（从网络）:', users1)
  
  // 再次请求（从缓存）
  const users2 = await request.get('/users', {}, {
    cache: true
  })
  console.log('再次请求（从缓存）:', users2)
  
  // 清除缓存
  request.clearCache('/users')
  
  // 再次请求（从网络）
  const users3 = await request.get('/users', {}, {
    cache: true
  })
  console.log('清除缓存后（从网络）:', users3)
}

/* -----------------------------------------------------------------------------
 * 示例 6: 重试机制
 * -------------------------------------------------------------------------- */

async function retryRequests() {
  const request = createRequest({ baseURL: '/api' })
  
  try {
    // 设置重试
    const data = await request.get('/unstable-endpoint', {}, {
      retry: 3,            // 失败后重试 3 次
      retryDelay: 1000     // 每次重试延迟 1 秒
    })
    console.log('请求成功:', data)
  } catch (error) {
    console.error('重试 3 次后仍失败:', error)
  }
}

/* -----------------------------------------------------------------------------
 * 示例 7: 不同响应类型
 * -------------------------------------------------------------------------- */

async function differentResponseTypes() {
  const request = createRequest({ baseURL: '/api' })
  
  // JSON 响应（默认）
  const jsonData = await request.get<{ name: string }>('/data.json')
  console.log('JSON 数据:', jsonData)
  
  // 文本响应
  const textData = await request.get<string>('/script.js', {}, {
    responseType: 'text'
  })
  console.log('文本数据:', textData)
  
  // Blob 响应（文件下载）
  const blob = await request.get<Blob>('/file.pdf', {}, {
    responseType: 'blob'
  })
  console.log('Blob 数据:', blob)
}

/* -----------------------------------------------------------------------------
 * 示例 8: 全局默认实例
 * -------------------------------------------------------------------------- */

function globalInstance() {
  // 使用全局默认实例
  const request = getDefaultRequest()
  
  // 配置拦截器
  request.interceptors.request.use(
    createAuthInterceptor(() => 'my-token')
  )
  
  // 在其他地方也可以使用相同实例
  async function fetchUsers() {
    const request = getDefaultRequest()
    return request.get('/users')
  }
  
  fetchUsers()
}

/* -----------------------------------------------------------------------------
 * 示例 9: 业务 API 封装
 * -------------------------------------------------------------------------- */

class UserApi {
  private request = createRequest({ baseURL: '/api' })
  
  constructor() {
    // 配置拦截器
    this.request.interceptors.request.use(
      createAuthInterceptor(() => localStorage.getItem('token'))
    )
    
    this.request.interceptors.response.use(
      createStandardApiInterceptor()
    )
  }
  
  async getUsers(params?: { page?: number; pageSize?: number }) {
    return this.request.get<User[]>('/users', params)
  }
  
  async getUserById(id: number) {
    return this.request.get<User>(`/users/${id}`)
  }
  
  async createUser(data: Partial<User>) {
    return this.request.post<User>('/users', data)
  }
  
  async updateUser(id: number, data: Partial<User>) {
    return this.request.put<User>(`/users/${id}`, data)
  }
  
  async deleteUser(id: number) {
    return this.request.delete(`/users/${id}`)
  }
}

interface User {
  id: number
  name: string
  email: string
}

// 使用
async function useUserApi() {
  const userApi = new UserApi()
  
  const users = await userApi.getUsers({ page: 1, pageSize: 10 })
  console.log('用户列表:', users)
  
  const user = await userApi.getUserById(1)
  console.log('用户详情:', user)
}

/* -----------------------------------------------------------------------------
 * 示例 10: 文件上传
 * -------------------------------------------------------------------------- */

async function uploadFile() {
  const request = createRequest({ baseURL: '/api' })
  
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = fileInput.files?.[0]
  
  if (!file) return
  
  // 使用 FormData
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', file.name)
  
  const result = await request.post('/upload', formData, {
    headers: {
      // 不设置 Content-Type，让浏览器自动设置（包含 boundary）
    }
  })
  
  console.log('上传成功:', result)
}

/* -----------------------------------------------------------------------------
 * 示例 11: 并发请求
 * -------------------------------------------------------------------------- */

async function concurrentRequests() {
  const request = createRequest({ baseURL: '/api' })
  
  // 并发发起多个请求
  const [users, posts, comments] = await Promise.all([
    request.get('/users'),
    request.get('/posts'),
    request.get('/comments')
  ])
  
  console.log('用户:', users)
  console.log('文章:', posts)
  console.log('评论:', comments)
}

/* -----------------------------------------------------------------------------
 * 示例 12: 错误处理
 * -------------------------------------------------------------------------- */

async function errorHandling() {
  const request = createRequest({ baseURL: '/api' })
  
  try {
    await request.get('/nonexistent')
  } catch (error) {
    if (error instanceof Error) {
      const requestError = error as any
      console.error('错误信息:', error.message)
      console.error('错误代码:', requestError.code)
      console.error('HTTP 状态:', requestError.status)
      console.error('请求配置:', requestError.config)
    }
  }
}

/* -----------------------------------------------------------------------------
 * 导出示例函数
 * -------------------------------------------------------------------------- */

export {
  basicUsage,
  requestWithParams,
  setupInterceptors,
  customInterceptors,
  cachedRequests,
  retryRequests,
  differentResponseTypes,
  globalInstance,
  useUserApi,
  uploadFile,
  concurrentRequests,
  errorHandling
}
