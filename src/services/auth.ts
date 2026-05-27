/**
 * 认证服务 — 前端 Token 管理 + API 调用封装。
 *
 * 存储布局：
 *   localStorage: spark_token (JWT), spark_user (JSON)
 *
 * 所有 API 调用自动附带 X-Tenant-Id 头。
 */

import { createRequest, isRequestError, isRecord } from '@spark-view/spark-utils'
import { isStringArray, readStringProperty } from '@spark-view/spark-utils/internal'

// ── Token 管理 ──────────────────────────────────────────────────────────────

const TOKEN_KEY = 'spark_token'
const USER_KEY = 'spark_user'
const LOGOUT_PENDING_KEY = 'spark_logout_pending'

export type AuthUser = {
  userId: string
  username: string
  displayName: string
  email: string
  avatar: string
  roles: string[]
  tenantId: string
  defaultProjectId: string}

type PlatformAdminUserLike = {
  tenantId?: string
  roles?: readonly string[]}


function isAuthUser(value: unknown): value is AuthUser {
  return isRecord(value)
    && typeof value['userId'] === 'string'
    && typeof value['username'] === 'string'
    && typeof value['displayName'] === 'string'
    && typeof value['email'] === 'string'
    && typeof value['avatar'] === 'string'
    && isStringArray(value['roles'])
    && typeof value['tenantId'] === 'string'
    && typeof value['defaultProjectId'] === 'string'
}

function normalizeAuthUser(value: unknown, defaultProjectId: unknown, context: string): AuthUser {
  if (!isRecord(value) || typeof value['userId'] !== 'string') {
    throw new Error(`${context}缺少有效 user 对象`)
  }
  const username = readStringProperty(value, 'username') ?? value['userId']
  return {
    userId: value['userId'],
    username,
    displayName: readStringProperty(value, 'displayName') ?? username,
    email: readStringProperty(value, 'email') ?? '',
    avatar: readStringProperty(value, 'avatar') ?? '',
    roles: isStringArray(value['roles']) ? value['roles'] : [],
    tenantId: readStringProperty(value, 'tenantId') ?? '',
    defaultProjectId: typeof defaultProjectId === 'string' && defaultProjectId.length > 0
      ? defaultProjectId
      : readStringProperty(value, 'defaultProjectId') ?? 'homepage',
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isAuthUser(parsed) ? parsed : null
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

export function isPlatformAdminUser(user: PlatformAdminUserLike | null = getUser()): boolean {
  return user?.tenantId === 'platform' && isStringArray(user.roles) && user.roles.includes('platform_admin')
}

function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function markLogoutPending(): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(LOGOUT_PENDING_KEY, '1')
}

export function consumePendingLogout(): void {
  if (typeof window === 'undefined') return
  if (sessionStorage.getItem(LOGOUT_PENDING_KEY) !== '1') return
  sessionStorage.removeItem(LOGOUT_PENDING_KEY)
  clearAuth()
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

const authHttp = createRequest()

async function authFetch(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  try {
    return await authHttp.post<Record<string, unknown>>(url, body)
  } catch (err) {
    const response = isRequestError(err) ? err.response : undefined
    const error = isRecord(response) && isRecord(response['error']) ? response['error'] : undefined
    const message = isRecord(response) ? response['message'] : undefined
    const serverMsg = typeof error?.['message'] === 'string' ? error['message'] : message
    const status = isRequestError(err) ? err.status ?? 0 : 0
    throw new Error(typeof serverMsg === 'string' ? serverMsg : typeof message === 'string' ? message : `请求失败 (${status})`)
  }
}

export type LoginParams = {
  tenantId: string
  username: string
  password: string}

export async function login(params: LoginParams): Promise<AuthUser> {
  const data = await authFetch('/api/auth/login', { ...params })
  const token = data['token']
  const user = data['user']
  if (typeof token !== 'string' || token === '') throw new Error('登录响应缺少有效 token')
  const authUser = normalizeAuthUser(user, data['defaultProjectId'], '登录响应')
  saveAuth(token, authUser)
  return authUser
}

export type RegisterParams = {
  tenantId: string
  username: string
  password: string
  displayName?: string
  email?: string}

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
  const authUser = normalizeAuthUser(user, data['defaultProjectId'], '注册响应')
  saveAuth(token, authUser)
  return authUser
}

export type RegisterTenantParams = {
  tenantId: string
  tenantName: string
  username: string
  password: string}

export async function registerTenant(params: RegisterTenantParams): Promise<AuthUser> {
  const data = await authFetch('/api/auth/register-tenant', { ...params })
  const token = data['token']
  const user = data['user']
  if (typeof token !== 'string' || token === '') throw new Error('租户注册响应缺少有效 token')
  const authUser = normalizeAuthUser(user, data['defaultProjectId'], '租户注册响应')
  saveAuth(token, authUser)
  return authUser
}

export function logout(): void {
  clearAuth()
}
