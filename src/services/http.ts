/**
 * 统一 HTTP 客户端 — 自动注入认证 / 租户请求头
 *
 * 所有 `src/` 层 API 调用统一使用此模块导出的 `http` 实例，
 * 替代 `fetch()` + 已废除的 `installFetchInterceptor`。
 *
 * ## 用法
 * ```ts
 * import { http } from '@/services/http'
 *
 * // GET
 * const data = await http.get<MyType>('/api/xxx')
 *
 * // POST JSON
 * await http.post('/api/xxx', { key: 'value' })
 *
 * // PUT
 * await http.put('/api/xxx', payload)
 *
 * // DELETE
 * await http.delete('/api/xxx')
 *
 * // 完整响应（含 status / headers）
 * const resp = await http.requestFull<T>({ url, method: 'POST', data })
 * ```
 */

import { createRequest } from '@spark-view/spark-utils'
import type { HttpClient } from '@spark-view/spark-utils'
import { getToken, getUser, clearAuth } from './auth'

export function createAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = getToken()
  const user = getUser()
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (user?.tenantId) headers['X-Tenant-Id'] = user.tenantId
  if (user?.defaultProjectId) headers['X-Project-Id'] = user.defaultProjectId
  return headers
}

let _instance: HttpClient | null = null

/**
 * 获取带认证拦截器的全局 Request 实例（懒初始化单例）
 */
export function getHttpClient(): HttpClient {
  if (_instance) return _instance

  _instance = createRequest({ timeout: 30_000 })

  // 请求拦截：自动注入 auth + tenant headers
  _instance.interceptors.request.use({
    onRequest: (config) => {
      const authHeaders = createAuthHeaders()
      config.headers = { ...config.headers, ...authHeaders }
      return config
    },
  })

  // 响应拦截：401 自动跳转登录
  _instance.interceptors.response.use({
    onResponseError: (error) => {
      if (error.status === 401 && !error.config.url.includes('/api/auth/')) {
        clearAuth()
        if (window.location.pathname !== '/') {
          window.location.href = '/'   // 跳平台首页，由路由守卫统一处理未登录重定向
        }
      }
      throw error
    },
  })

  return _instance
}

/** 全局 HTTP 客户端（带认证拦截器） */
export const http: HttpClient = new Proxy({} as HttpClient, {
  get(_target, prop, receiver): unknown {
    return Reflect.get(getHttpClient(), prop, receiver) as unknown
  },
})
