/**
 * AuthService 测试
 *
 * 覆盖：
 * - 初始化守卫（重复 init 抛错、自动 init）
 * - Mock 模式登录 / checkAuth / isAuthenticated
 * - Token 管理集成
 * - 生命周期钩子触发
 * - 真实 API 路径（mock HTTP client）
 * - refreshToken 并发锁
 * - logout 清除 token（即使 API 失败）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const httpMock = vi.hoisted(() => ({
  requestFull: vi.fn(),
}))

vi.mock('@spark-view/spark-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-view/spark-utils')>()
  return {
    ...actual,
    createRequest: vi.fn(() => ({
      requestFull: httpMock.requestFull,
    })),
  }
})

import { AuthService } from '../AuthService'
import type { AuthConfig, AuthResult } from '../types'

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * 最小 mock 模式配置
 */
function mockConfig(overrides?: Partial<AuthConfig>): AuthConfig {
  return {
    enableMock: true,
    apiEndpoints: undefined,
    tokenStorage: 'memory',
    tokenKey: 'test_token',
    loginPath: undefined,
    loginComponent: undefined,
    mockUser: undefined,
    mockTenant: undefined,
    timeout: undefined,
    apiBaseUrl: undefined,
    onLoginSuccess: undefined,
    onLogoutSuccess: undefined,
    onAuthError: undefined,
    onTokenRefresh: undefined,
    ...overrides,
  }
}

function httpResponse(data: unknown, status = 200, statusText = 'OK') {
  return {
    data,
    status,
    statusText,
    headers: {},
  }
}

function fakeAuthResult(token?: string): AuthResult {
  const result: AuthResult = {
    user: {
      userId: 'u1',
      username: 'test',
      displayName: 'Test',
      email: 'test@test.com',
      roles: ['user'],
      permissions: ['read'],
    },
    tenant: { tenantId: 't1', tenantName: 'T', config: {} },
    env: { mode: 'development', apiBaseUrl: '', version: '1' },
  }
  if (token !== undefined) result.token = token
  return result
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe('AuthService', () => {
  let auth: AuthService

  beforeEach(() => {
    auth = new AuthService()
  })

  afterEach(() => {
    httpMock.requestFull.mockReset()
    vi.restoreAllMocks()
  })

  // ── 初始化 ──

  describe('initialize', () => {
    it('初始化成功后 isAuthenticated() 不抛错', () => {
      auth.initialize(mockConfig())
      expect(auth.isAuthenticated()).toBe(true) // mock 模式始终 true
    })

    it('重复初始化抛出错误', () => {
      auth.initialize(mockConfig())
      expect(() => auth.initialize(mockConfig())).toThrow('已经初始化')
    })

    it('未显式初始化时，login 自动初始化默认配置', async () => {
      // 默认 config enableMock=false，且无 token → real login → HTTP client
      httpMock.requestFull.mockResolvedValue(httpResponse(fakeAuthResult('tok')))

      await auth.login({ username: 'a', password: 'b' })
      expect(httpMock.requestFull).toHaveBeenCalled()
    })
  })

  // ── Mock 模式 ──

  describe('mock 模式', () => {
    beforeEach(() => {
      auth.initialize(mockConfig())
    })

    it('login 返回 AuthResult 并保存 token', async () => {
      const result = await auth.login({ username: 'admin', password: '123' })

      expect(result.user).toBeDefined()
      expect(result.user.username).toBe('admin')
      expect(result.token).toBeDefined()
      expect(auth.getToken()).toBeTruthy()
    })

    it('login 使用自定义 mockUser', async () => {
      const custom = new AuthService()
      custom.initialize(mockConfig({
        mockUser: {
          userId: 'custom',
          username: 'custom-user',
          displayName: 'Custom',
          email: 'c@c.com',
          roles: [],
          permissions: [],
        },
      }))

      const result = await custom.login({ username: 'x', password: 'y' })
      expect(result.user.userId).toBe('custom')
      expect(result.user.username).toBe('custom-user')
    })

    it('checkAuth 返回 AuthResult（mock 模式不需 token）', async () => {
      const result = await auth.checkAuth()
      expect(result).not.toBeNull()
      expect(result?.user.username).toBe('admin')
    })

    it('isAuthenticated 在 mock 模式下始终 true', () => {
      expect(auth.isAuthenticated()).toBe(true)
    })

    it('logout 清除 token', async () => {
      await auth.login({ username: 'a', password: 'b' })
      expect(auth.getToken()).toBeTruthy()
      await auth.logout()
      expect(auth.getToken()).toBeNull()
    })
  })

  // ── Token 管理 ──

  describe('token 管理', () => {
    beforeEach(() => {
      auth.initialize(mockConfig())
    })

    it('setToken / getToken / clearToken', () => {
      auth.setToken('mytoken')
      expect(auth.getToken()).toBe('mytoken')
      auth.clearToken()
      expect(auth.getToken()).toBeNull()
    })
  })

  // ── 生命周期钩子 ──

  describe('生命周期钩子', () => {
    it('onLoginSuccess 在登录成功后被调用', async () => {
      const hook = vi.fn()
      auth.initialize(mockConfig({ onLoginSuccess: hook }))
      await auth.login({ username: 'a', password: 'b' })
      expect(hook).toHaveBeenCalledTimes(1)
      expect(hook.mock.calls[0]?.[0]).toHaveProperty('username', 'a')
    })

    it('onLogoutSuccess 在登出成功后被调用', async () => {
      const hook = vi.fn()
      auth.initialize(mockConfig({ onLogoutSuccess: hook }))
      await auth.logout()
      expect(hook).toHaveBeenCalledTimes(1)
    })

    it('onAuthError 在登录失败时被调用（real API 失败）', async () => {
      const errorHook = vi.fn()
      auth.initialize(mockConfig({
        enableMock: false,
        onAuthError: errorHook,
      }))

      httpMock.requestFull.mockResolvedValue(httpResponse(null, 401, 'Unauthorized'))

      await expect(auth.login({ username: 'a', password: 'b' })).rejects.toThrow('登录失败')
      expect(errorHook).toHaveBeenCalledTimes(1)
    })
  })

  // ── 真实 API 路径 ──

  describe('真实 API 路径', () => {
    beforeEach(() => {
      auth.initialize(mockConfig({ enableMock: false, apiBaseUrl: 'http://test' }))
    })

    it('login 成功 → 解析 AuthResult 并保存 token', async () => {
      httpMock.requestFull.mockResolvedValue(httpResponse(fakeAuthResult('server-token')))

      const result = await auth.login({ username: 'a', password: 'b' })
      expect(result.token).toBe('server-token')
      expect(auth.getToken()).toBe('server-token')
    })

    it('login 失败 → 抛出错误', async () => {
      httpMock.requestFull.mockResolvedValue(httpResponse(null, 401, 'Unauthorized'))

      await expect(auth.login({ username: 'a', password: 'b' }))
        .rejects.toThrow('登录失败')
    })

    it('checkAuth 无 token → 返回 null', async () => {
      const result = await auth.checkAuth()
      expect(result).toBeNull()
    })

    it('checkAuth 有 token → 调用 /api/auth/me', async () => {
      auth.setToken('tok')
      httpMock.requestFull.mockResolvedValue(httpResponse(fakeAuthResult()))

      const result = await auth.checkAuth()
      expect(result).not.toBeNull()
      expect(result?.user.username).toBe('test')
    })

    it('logout 即使 API 失败也清除本地 token', async () => {
      auth.setToken('tok')
      httpMock.requestFull.mockResolvedValue(httpResponse(null, 500, 'Internal Error'))

      await expect(auth.logout()).rejects.toThrow('登出失败')
      expect(auth.getToken()).toBeNull()
    })
  })

  // ── refreshToken 并发锁 ──

  describe('refreshToken 并发锁', () => {
    beforeEach(() => {
      auth.initialize(mockConfig({ enableMock: false, apiBaseUrl: 'http://test' }))
      auth.setToken('old-tok')
    })

    it('并发调用共享同一个请求', async () => {
      let callCount = 0
      httpMock.requestFull.mockImplementation(async () => {
        callCount++
        await new Promise(r => setTimeout(r, 50))
        return httpResponse({ token: 'new-tok' })
      })

      const [t1, t2, t3] = await Promise.all([
        auth.refreshToken(),
        auth.refreshToken(),
        auth.refreshToken(),
      ])

      expect(callCount).toBe(1) // 只有 1 次网络请求
      expect(t1).toBe('new-tok')
      expect(t2).toBe('new-tok')
      expect(t3).toBe('new-tok')
      expect(auth.getToken()).toBe('new-tok')
    })

    it('刷新失败 → 清除 token 并抛错', async () => {
      httpMock.requestFull.mockResolvedValue(httpResponse(null, 401, 'Expired'))

      await expect(auth.refreshToken()).rejects.toThrow('Token 刷新失败')
      expect(auth.getToken()).toBeNull()
    })

    it('刷新完成后锁释放，下次调用发起新请求', async () => {
      let callCount = 0
      httpMock.requestFull.mockImplementation(async () => {
        callCount++
        return httpResponse({ token: `tok-${callCount}` })
      })

      await auth.refreshToken()
      await auth.refreshToken()

      expect(callCount).toBe(2) // 两次独立请求
    })
  })
})
