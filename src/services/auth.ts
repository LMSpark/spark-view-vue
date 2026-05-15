/**
 * 认证服务 — 前端 Token 管理 + API 调用封装。
 *
 * 存储布局：
 *   localStorage: spark_token (JWT), spark_user (JSON)
 *
 * 所有 API 调用自动附带 X-Tenant-Id 头。
 */

import { createFetchClient } from '@spark-view/spark-utils'
import type { RequestError } from '@spark-view/spark-utils'

// ── Token 管理 ──────────────────────────────────────────────────────────────

const TOKEN_KEY = 'spark_token'
const USER_KEY = 'spark_user'

export interface AuthUser {
  userId: string
  username: string
  displayName: string
  email: string
  avatar: string
  roles: string[]
  tenantId: string
  defaultProjectId: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token || token.trim().length === 0) return false
  const user = getUser()
  if (!user) return false
  if (typeof user.tenantId !== 'string' || user.tenantId.trim().length === 0) return false
  if (typeof user.defaultProjectId !== 'string' || user.defaultProjectId.trim().length === 0) return false
  return true
}

function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

/**
 * 切换当前项目上下文。
 * 更新 localStorage 中 user.defaultProjectId，后续所有 API 调用自动路由到新项目。
 */
export function switchProject(projectId: string): void {
  const user = getUser()
  if (!user) return
  user.defaultProjectId = projectId
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}


// ── API 调用 ────────────────────────────────────────────────────────────────

const authHttp = createFetchClient()

async function authFetch(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  try {
    return await authHttp.post<Record<string, unknown>>(url, body)
  } catch (err) {
    const reqErr = err as RequestError
    const response = reqErr.response as Record<string, unknown> | undefined
    const error = response?.['error'] as Record<string, unknown> | undefined
    const serverMsg = typeof error?.['message'] === 'string' ? error['message'] : response?.['message']
    throw new Error(typeof serverMsg === 'string' ? serverMsg : `请求失败 (${reqErr.status ?? 0})`)
  }
}

export interface LoginParams {
  tenantId: string
  username: string
  password: string
}

export async function login(params: LoginParams): Promise<AuthUser> {
  const data = await authFetch('/api/auth/login', { ...params })
  const token = data['token']
  const user = data['user']
  if (typeof token !== 'string' || token === '') throw new Error('登录响应缺少有效 token')
  if (typeof user !== 'object' || user === null || typeof (user as Record<string, unknown>)['userId'] !== 'string') {
    throw new Error('登录响应缺少有效 user 对象')
  }
  const authUser = user as AuthUser
  authUser.defaultProjectId = (data['defaultProjectId'] as string | undefined) ?? 'homepage'
  saveAuth(token, authUser)
  return authUser
}

export interface RegisterParams {
  tenantId: string
  username: string
  password: string
  displayName?: string
  email?: string
}

export async function register(params: RegisterParams): Promise<AuthUser> {
  const body: Record<string, string> = {
    tenantId: params.tenantId,
    username: params.username,
    password: params.password,
  }
  if (params.displayName) body['displayName'] = params.displayName
  if (params.email) body['email'] = params.email

  const data = await authFetch('/api/auth/register', body)
  const token = data['token']
  const user = data['user']
  if (typeof token !== 'string' || token === '') throw new Error('注册响应缺少有效 token')
  if (typeof user !== 'object' || user === null || typeof (user as Record<string, unknown>)['userId'] !== 'string') {
    throw new Error('注册响应缺少有效 user 对象')
  }
  const authUser = user as AuthUser
  authUser.defaultProjectId = (data['defaultProjectId'] as string | undefined) ?? 'homepage'
  saveAuth(token, authUser)
  return authUser
}

export interface RegisterTenantParams {
  tenantId: string
  tenantName: string
  username: string
  password: string
}

export async function registerTenant(params: RegisterTenantParams): Promise<AuthUser> {
  const data = await authFetch('/api/auth/register-tenant', { ...params })
  const token = data['token']
  const user = data['user']
  if (typeof token !== 'string' || token === '') throw new Error('租户注册响应缺少有效 token')
  if (typeof user !== 'object' || user === null || typeof (user as Record<string, unknown>)['userId'] !== 'string') {
    throw new Error('租户注册响应缺少有效 user 对象')
  }
  const authUser = user as AuthUser
  authUser.defaultProjectId = (data['defaultProjectId'] as string | undefined) ?? 'homepage'
  saveAuth(token, authUser)
  return authUser
}

export function logout(): void {
  clearAuth()
}
