/**
 * 认证服务 — 前端 Token 管理 + API 调用封装。
 *
 * 存储布局：
 *   localStorage: spark_token (JWT), spark_user (JSON)
 *
 * 所有 API 调用自动附带 X-Tenant-Id 头。
 */

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
  return getToken() !== null
}

function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// ── API 调用 ────────────────────────────────────────────────────────────────

async function authFetch(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await resp.json()) as Record<string, unknown>
  if (!resp.ok) {
    throw new Error((data['message'] as string | undefined) ?? `请求失败 (${resp.status})`)
  }
  return data
}

export interface LoginParams {
  tenantId: string
  username: string
  password: string
}

export async function login(params: LoginParams): Promise<AuthUser> {
  const data = await authFetch('/api/auth/login', { ...params })
  const token = data['token'] as string
  const user = data['user'] as AuthUser
  user.defaultProjectId = (data['defaultProjectId'] as string | undefined) ?? 'homepage'
  saveAuth(token, user)
  return user
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
  const token = data['token'] as string
  const user = data['user'] as AuthUser
  user.defaultProjectId = (data['defaultProjectId'] as string | undefined) ?? 'homepage'
  saveAuth(token, user)
  return user
}

export interface RegisterTenantParams {
  tenantId: string
  tenantName: string
  username: string
  password: string
}

export async function registerTenant(params: RegisterTenantParams): Promise<AuthUser> {
  const data = await authFetch('/api/auth/register-tenant', { ...params })
  const token = data['token'] as string
  const user = data['user'] as AuthUser
  user.defaultProjectId = (data['defaultProjectId'] as string | undefined) ?? 'homepage'
  saveAuth(token, user)
  return user
}

export function logout(): void {
  clearAuth()
}

// ── 全局 fetch 拦截（注入 Authorization + X-Tenant-Id） ────────────────────

let _interceptorInstalled = false

export function installFetchInterceptor(): void {
  if (_interceptorInstalled) return
  _interceptorInstalled = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const token = getToken()
    const user = getUser()

    // 仅拦截相对路径（同源 API）
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const isRelative = url.startsWith('/') || url.startsWith(window.location.origin)

    if (token && isRelative) {
      const headers = new Headers(init?.headers)
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      if (!headers.has('X-Tenant-Id') && user?.tenantId) {
        headers.set('X-Tenant-Id', user.tenantId)
      }
      if (!headers.has('X-Project-Id') && user?.defaultProjectId) {
        headers.set('X-Project-Id', user.defaultProjectId)
      }
      const resp = await originalFetch(input, { ...init, headers })

      // Token 过期/无效 → 清除认证并跳转登录页
      if (resp.status === 401 && !url.includes('/api/auth/')) {
        clearAuth()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }

      return resp
    }

    return originalFetch(input, init)
  }
}
