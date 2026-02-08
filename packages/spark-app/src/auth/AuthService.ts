/**
 * 认证服务
 * 提供完整的登录、登出、Token 管理、认证检查功能
 */

import type { AuthConfig, LoginCredentials, AuthResult, IAuthService } from './types'
import type { AppEnvironment } from '../types'
import { TokenManager } from './TokenManager'
import { createLogger } from '../logger'
import { simpleEnvAdapter as envAdapter } from '../utils/simpleEnv'

const authLogger = createLogger('auth')

/**
 * 认证服务实现
 */
export class AuthService implements IAuthService {
  private config!: AuthConfig & { apiEndpoints: NonNullable<AuthConfig['apiEndpoints']> }
  private tokenManager: TokenManager
  private initialized = false

  constructor() {
    this.tokenManager = new TokenManager()
  }

  /**
   * 初始化认证服务
   */
  initialize(config: AuthConfig): void {
    this.config = {
      tokenStorage: 'localStorage',
      tokenKey: 'spark_token',
      loginPath: '/login',
      enableMock: false,
      timeout: 10000,
      apiBaseUrl: '',
      ...config,
      apiEndpoints: {
        login: '/api/auth/login',
        logout: '/api/auth/logout',
        me: '/api/auth/me',
        refresh: '/api/auth/refresh',
        ...config.apiEndpoints
      }
    }
    this.tokenManager = new TokenManager(
      this.config.tokenStorage,
      this.config.tokenKey
    )
    this.initialized = true
    authLogger.info('认证服务已初始化', { storage: this.config.tokenStorage })
  }

  /**
   * 登录
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    this.ensureInitialized()
    authLogger.info('执行登录', { username: credentials.username })

    try {
      // Mock 模式
      if (this.config.enableMock) {
        return await this.mockLogin(credentials)
      }

      // 真实登录请求
      const response = await this.fetchWithTimeout(
        `${this.config.apiBaseUrl}${this.config.apiEndpoints.login}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
          credentials: 'include'
        },
        this.config.timeout ?? 10000
      )

      if (!response.ok) {
        throw new Error(`登录失败: ${response.statusText}`)
      }

      const result: AuthResult = await response.json()

      // 保存 Token
      if (result.token) {
        this.setToken(result.token)
      }

      // 触发钩子
      await this.config.onLoginSuccess?.(result.user)

      authLogger.success('登录成功', { username: result.user.username })
      return result

    } catch (error) {
      authLogger.error('登录失败', error as Error)
      this.config.onAuthError?.(error as Error)
      throw error
    }
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    this.ensureInitialized()
    authLogger.info('执行登出')

    try {
      // Mock 模式直接清除 Token
      if (!this.config.enableMock) {
        // 调用登出 API
        await this.fetchWithTimeout(
          `${this.config.apiBaseUrl}${this.config.apiEndpoints.logout}`,
          {
            method: 'POST',
            headers: this.getAuthHeaders(),
            credentials: 'include'
          },
          this.config.timeout ?? 10000
        )
      }

      // 清除 Token
      this.clearToken()

      // 触发钩子
      await this.config.onLogoutSuccess?.()

      authLogger.success('登出成功')

    } catch (error) {
      authLogger.error('登出失败', error as Error)
      // 即使登出失败也清除本地 Token
      this.clearToken()
      throw error
    }
  }

  /**
   * 检查认证状态
   */
  async checkAuth(): Promise<AuthResult | null> {
    this.ensureInitialized()

    const token = this.getToken()
    if (!token && !this.config.enableMock) {
      return null
    }

    try {
      // Mock 模式
      if (this.config.enableMock) {
        return await this.mockCheckAuth()
      }

      // 调用 /me 接口
      const response = await this.fetchWithTimeout(
        `${this.config.apiBaseUrl}${this.config.apiEndpoints.me}`,
        {
          method: 'GET',
          headers: this.getAuthHeaders(),
          credentials: 'include'
        },
        this.config.timeout ?? 10000
      )

      if (!response.ok) {
        // Token 无效，清除
        this.clearToken()
        return null
      }

      const result: AuthResult = await response.json()
      authLogger.debug('认证检查成功', { username: result.user.username })
      return result

    } catch (error) {
      authLogger.error('认证检查失败', error as Error)
      this.clearToken()
      return null
    }
  }

  /**
   * 是否已认证
   */
  isAuthenticated(): boolean {
    return !!this.getToken() || !!this.config.enableMock
  }

  /**
   * 获取 Token
   */
  getToken(): string | null {
    return this.tokenManager.getToken()
  }

  /**
   * 设置 Token
   */
  setToken(token: string): void {
    this.tokenManager.setToken(token)
    authLogger.debug('Token 已保存')
  }

  /**
   * 清除 Token
   */
  clearToken(): void {
    this.tokenManager.clearToken()
    authLogger.debug('Token 已清除')
  }

  /**
   * 刷新 Token
   */
  async refreshToken(): Promise<string> {
    this.ensureInitialized()
    authLogger.info('刷新 Token')

    try {
      const response = await this.fetchWithTimeout(
        `${this.config.apiBaseUrl}${this.config.apiEndpoints.refresh}`,
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'include'
        },
        this.config.timeout ?? 10000
      )

      if (!response.ok) {
        throw new Error('Token 刷新失败')
      }

      const { token } = await response.json()
      this.setToken(token)
      this.config.onTokenRefresh?.(token)

      authLogger.success('Token 刷新成功')
      return token

    } catch (error) {
      authLogger.error('Token 刷新失败', error as Error)
      this.clearToken()
      throw error
    }
  }

  // ========== Private Methods ==========

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('AuthService 未初始化，请先调用 initialize()')
    }
  }

  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async mockLogin(credentials: LoginCredentials): Promise<AuthResult> {
    authLogger.debug('[Mock] 模拟登录', { username: credentials.username })

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 500))

    const env = envAdapter.getEnvironment()

    return {
      user: this.config.mockUser ?? {
        userId: 'mock-user-001',
        username: credentials.username,
        displayName: '模拟用户',
        email: `${credentials.username}@example.com`,
        roles: ['user', 'admin'],
        permissions: ['read', 'write', 'delete', 'home:view']
      },
      tenant: this.config.mockTenant ?? {
        tenantId: 'mock-tenant-001',
        tenantName: '模拟租户',
        config: {}
      },
      env: {
        mode: (env.isClient ? 'development' : 'production') as AppEnvironment,
        apiBaseUrl: this.config.apiBaseUrl ?? '',
        version: '1.0.0'
      },
      token: 'mock-token-' + Date.now()
    }
  }

  private async mockCheckAuth(): Promise<AuthResult> {
    authLogger.debug('[Mock] 模拟认证检查')

    const env = envAdapter.getEnvironment()

    return {
      user: this.config.mockUser ?? {
        userId: 'mock-user-001',
        username: 'admin',
        displayName: '管理员',
        email: 'admin@example.com',
        roles: ['user', 'admin'],
        permissions: ['read', 'write', 'delete', 'home:view']
      },
      tenant: this.config.mockTenant ?? {
        tenantId: 'mock-tenant-001',
        tenantName: '默认租户',
        config: {}
      },
      env: {
        mode: (env.isClient ? 'development' : 'production') as AppEnvironment,
        apiBaseUrl: this.config.apiBaseUrl ?? '',
        version: '1.0.0'
      }
    }
  }
}

/**
 * 创建认证服务实例（推荐：用于 DI 注入场景）
 */
export function createAuthService(): IAuthService {
  return new AuthService()
}

/**
 * 全局认证服务实例
 * @deprecated 推荐使用 createAuthService() 配合 DI 注入
 */
export const authService = new AuthService()
