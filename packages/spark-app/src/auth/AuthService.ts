/**
 * 认证服务 - AuthService
 *
 * 提供完整的用户认证解决方案，包括：
 * - 用户登录/登出
 * - Token 管理（存储、刷新、验证）
 * - 认证状态检查
 * - Mock 模式支持（开发环境）
 * - 生命周期钩子（登录成功、登出成功、认证错误等）
 *
 * @packageDocumentation
 */

// =============================================================================
// 1. 导入语句 (Imports)
// =============================================================================

// ==================== 类型定义 ====================
import type { AuthConfig, LoginCredentials, AuthResult, IAuthService } from './types'
import type { AppEnvironment, EnvironmentInfo } from '../types'

// ==================== 核心依赖 ====================
import { TokenManager } from './TokenManager'
import { createLogger } from '../logger'
import { toError } from '@spark-view/spark-utils'
import { simpleEnvAdapter as envAdapter } from '../utils/simpleEnv'

// =============================================================================
// 2. 常量和日志 (Constants & Logger)
// =============================================================================

/** Mock 模式默认网络延迟（毫秒） */
const MOCK_DELAY_MS = 500

/** 认证服务日志器 */
const authLogger = createLogger('auth')

// =============================================================================
// 3. 核心类 (Core Class)
// =============================================================================

/**
 * 认证服务实现类
 *
 * 架构特点：
 * - 单例模式（通过工厂函数创建）
 * - 支持 Mock 模式（开发环境）
 * - 自动 Token 刷新
 * - 完整的生命周期钩子
 * - 错误处理和日志记录
 */
export class AuthService implements IAuthService {
  // =============================================================================
  // 私有属性 (Private Properties)
  // =============================================================================

  /** 认证配置（合并默认值后） */
  private config!: AuthConfig & { apiEndpoints: NonNullable<AuthConfig['apiEndpoints']> }

  /** Token 管理器 */
  private tokenManager!: TokenManager

  /** 初始化状态 */
  private initialized = false

  // =============================================================================
  // 构造函数 (Constructor)
  // =============================================================================

  /**
   * 创建 AuthService 实例
   *
   * @param config 可选的认证配置。如果不提供，将使用默认配置或延迟初始化
   *
   * @example
   * ```typescript
   * // 使用默认配置（延迟初始化）
   * const auth = new AuthService()
   *
   * // 使用自定义配置
   * const auth = new AuthService({
   *   apiBaseUrl: '/api',
   *   enableMock: true,
   *   tokenStorage: 'sessionStorage'
   * })
   * ```
   */
  constructor(config?: AuthConfig) {
    if (config) {
      this.initialize(config)
    } else {
      // 延迟初始化 - 使用默认 TokenManager
      this.tokenManager = new TokenManager()
    }
  }

  // =============================================================================
  // 公共方法 - 核心功能 (Public Methods - Core)
  // =============================================================================

  /**
   * 初始化认证服务
   *
   * @param config 认证配置
   * @throws {Error} 如果已初始化
   *
   * @example
   * ```typescript
   * authService.initialize({
   *   apiBaseUrl: '/api',
   *   enableMock: import.meta.env.DEV,
   *   onLoginSuccess: (user) => console.log('登录成功:', user.username)
   * })
   * ```
   */
  initialize(config: AuthConfig): void {
    if (this.initialized) {
      throw new Error('AuthService 已经初始化，不能重复初始化')
    }

    // 合并默认值后再赋值
    const mergedConfig = {
      tokenStorage: config.tokenStorage ?? 'localStorage',
      tokenKey: config.tokenKey ?? 'spark_token',
      loginPath: config.loginPath ?? '/login',
      loginComponent: config.loginComponent,
      enableMock: config.enableMock ?? false,
      mockUser: config.mockUser,
      mockTenant: config.mockTenant,
      timeout: config.timeout ?? 10000,
      apiBaseUrl: config.apiBaseUrl ?? '',
      apiEndpoints: config.apiEndpoints ?? {
        login: '/api/auth/login',
        logout: '/api/auth/logout',
        me: '/api/auth/me',
        refresh: '/api/auth/refresh'
      },
      onLoginSuccess: config.onLoginSuccess,
      onLogoutSuccess: config.onLogoutSuccess,
      onAuthError: config.onAuthError,
      onTokenRefresh: config.onTokenRefresh
    }

    this.config = mergedConfig

    // 重新创建 Token 管理器（使用新配置）
    this.tokenManager = new TokenManager(
      this.config.tokenStorage,
      this.config.tokenKey
    )

    this.initialized = true
    authLogger.info('✅ 认证服务已初始化', {
      storage: this.config.tokenStorage,
      mockEnabled: this.config.enableMock
    })
  }

  /**
   * 用户登录
   *
   * @param credentials 登录凭据
   * @returns 认证结果（包含用户信息、租户信息、环境信息）
   * @throws {Error} 登录失败时抛出异常
   *
   * @example
   * ```typescript
   * try {
   *   const result = await authService.login({
   *     username: 'admin',
   *     password: '123456'
   *   })
   *   console.log('登录成功:', result.user.username)
   * } catch (error) {
   *   console.error('登录失败:', error.message)
   * }
   * ```
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    this.ensureInitialized()
    authLogger.info('🔐 执行登录', { username: credentials.username })

    try {
      let result: AuthResult

      // Mock 模式 vs 真实 API
      if (this.config.enableMock) {
        result = await this.mockLogin(credentials)
      } else {
        result = await this.realLogin(credentials)
      }

      // 保存 Token
      if (result.token) {
        this.setToken(result.token)
      }

      // 触发登录成功钩子
      await this.config.onLoginSuccess?.(result.user)

      authLogger.success('✅ 登录成功', { username: result.user.username })
      return result

    } catch (error) {
      authLogger.error('❌ 登录失败', toError(error))
      this.config.onAuthError?.(toError(error))
      throw error
    }
  }

  /**
   * 用户登出
   *
   * @throws {Error} 登出 API 调用失败时抛出异常（但仍会清除本地 Token）
   *
   * @example
   * ```typescript
   * try {
   *   await authService.logout()
   *   console.log('登出成功')
   * } catch (error) {
   *   console.error('登出失败:', error.message)
   * }
   * ```
   */
  async logout(): Promise<void> {
    this.ensureInitialized()
    authLogger.info('🚪 执行登出')

    try {
      // Mock 模式直接清除 Token
      if (!this.config.enableMock) {
        await this.realLogout()
      }

      // 清除本地 Token
      this.clearToken()

      // 触发登出成功钩子
      await this.config.onLogoutSuccess?.()

      authLogger.success('✅ 登出成功')

    } catch (error) {
      authLogger.error('❌ 登出失败', toError(error))
      // 即使 API 调用失败，也要清除本地 Token
      this.clearToken()
      throw error
    }
  }

  /**
   * 检查认证状态
   *
   * @returns 认证结果或 null（未认证）
   *
   * @example
   * ```typescript
   * const authResult = await authService.checkAuth()
   * if (authResult) {
   *   console.log('用户已认证:', authResult.user.username)
   * } else {
   *   console.log('用户未认证')
   * }
   * ```
   */
  async checkAuth(): Promise<AuthResult | null> {
    this.ensureInitialized()

    const token = this.getToken()
    if (!token && !this.config.enableMock) {
      return null
    }

    try {
      let result: AuthResult

      if (this.config.enableMock) {
        result = await this.mockCheckAuth()
      } else {
        result = await this.realCheckAuth()
      }

      authLogger.debug('✅ 认证检查成功', { username: result.user.username })
      return result

    } catch (error) {
      authLogger.error('❌ 认证检查失败', toError(error))
      this.clearToken()
      return null
    }
  }

  /**
   * 检查是否已认证
   *
   * @returns 是否已认证
   * @note 这是一个同步方法，不会发起网络请求
   */
  isAuthenticated(): boolean {
    return !!this.getToken() || !!this.config.enableMock
  }

  // =============================================================================
  // 公共方法 - Token 管理 (Public Methods - Token)
  // =============================================================================

  /**
   * 获取当前 Token
   *
   * @returns Token 字符串或 null
   */
  getToken(): string | null {
    return this.tokenManager.getToken()
  }

  /**
   * 设置 Token
   *
   * @param token Token 字符串
   */
  setToken(token: string): void {
    this.tokenManager.setToken(token)
    authLogger.debug('💾 Token 已保存')
  }

  /**
   * 清除 Token
   */
  clearToken(): void {
    this.tokenManager.clearToken()
    authLogger.debug('🗑️ Token 已清除')
  }

  /**
   * 销毁认证服务，释放所有资源
   *
   * - 清除 Token
   * - 清除并发刷新锁
   * - 移除所有生命周期钩子引用
   * - 标记为未初始化（后续调用将静默返回或抛出）
   */
  destroy(): void {
    this.clearToken()
    this.refreshPromise = null
    if (this.config) {
      this.config.onLoginSuccess = undefined
      this.config.onLogoutSuccess = undefined
      this.config.onAuthError = undefined
      this.config.onTokenRefresh = undefined
    }
    this.initialized = false
    authLogger.info('🛑 认证服务已销毁')
  }

  /** 并发刷新锁：多个请求同时发现 token 过期时，共享同一个 refresh Promise */
  private refreshPromise: Promise<string> | null = null

  /**
   * 刷新 Token
   *
   * 内置并发锁：多个并发调用会共享同一个刷新请求，
   * 避免多个 refresh 请求同时发出导致 refresh token 被消耗。
   *
   * @returns 新的 Token
   * @throws {Error} 刷新失败时抛出异常
   */
  async refreshToken(): Promise<string> {
    this.ensureInitialized()

    // 并发锁：后续调用复用正在进行的刷新 Promise
    if (this.refreshPromise) {
      authLogger.debug('🔄 复用正在进行的 Token 刷新请求')
      return this.refreshPromise
    }

    authLogger.info('🔄 刷新 Token')
    this.refreshPromise = this.doRefreshToken().finally(() => {
      this.refreshPromise = null
    })

    return this.refreshPromise
  }

  /**
   * 实际执行 Token 刷新的内部方法
   * @private
   */
  private async doRefreshToken(): Promise<string> {
    try {
      const response = await this.fetchWithTimeout(
        this.apiUrl(this.config.apiEndpoints.refresh),
        {
          method: 'POST',
          headers: this.getAuthHeaders(),
          credentials: 'include'
        },
        this.callTimeout
      )

      if (!response.ok) {
        throw new Error(`Token 刷新失败: ${response.statusText}`)
      }

      const { token } = await response.json() as { token: string }
      this.setToken(token)

      // 触发 Token 刷新钩子
      this.config.onTokenRefresh?.(token)

      authLogger.success('✅ Token 刷新成功')
      return token

    } catch (error) {
      authLogger.error('❌ Token 刷新失败', toError(error))
      this.clearToken()
      throw error
    }
  }

  // =============================================================================
  // 私有方法 - 工具函数 (Private Methods - Utils)
  // =============================================================================

  /**
   * 确保服务已初始化
   *
   * @private
   * @throws {Error} 如果未初始化
   */
  /**
   * 确保服务已初始化
   *
   * 如果未初始化，自动使用默认配置进行初始化。
   * 这样可以避免在简单场景下需要显式调用 initialize()。
   *
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      // 自动初始化：initialize() 内部会对每个字段应用 ?? 默认值
      this.initialize({
        apiEndpoints: undefined,
        tokenStorage: undefined,
        tokenKey: undefined,
        loginPath: undefined,
        loginComponent: undefined,
        enableMock: false,
        mockUser: undefined,
        mockTenant: undefined,
        timeout: undefined,
        apiBaseUrl: '',
        onLoginSuccess: undefined,
        onLogoutSuccess: undefined,
        onAuthError: undefined,
        onTokenRefresh: undefined,
      })
    }
  }

  /**
   * 获取认证请求头
   *
   * @private
   * @returns 请求头对象
   */
  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  /**
   * 带超时的 Fetch 请求
   *
   * @private
   * @param url 请求 URL
   * @param options 请求选项
   * @param timeout 超时时间（毫秒）
   * @returns Response 对象
   */
  /** 配置超时（毫秒），回退到 10 秒 */
  private get callTimeout(): number {
    return this.config.timeout ?? 10000
  }

  /** 拼接 API 完整 URL */
  private apiUrl(endpoint: string | undefined): string {
    return this.config.apiBaseUrl + (endpoint ?? '')
  }

  /** 构建 Mock 环境信息（mockLogin / mockCheckAuth 共用） */
  private buildMockEnv(): EnvironmentInfo {
    const env = envAdapter.getEnvironment()
    return {
      mode: (env.isClient ? 'development' : 'production') as AppEnvironment,
      apiBaseUrl: this.config.apiBaseUrl ?? '',
      version: '1.0.0'
    }
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

  // =============================================================================
  // 私有方法 - 真实 API 调用 (Private Methods - Real API)
  // =============================================================================

  /**
   * 执行真实登录 API 调用
   *
   * @private
   * @param credentials 登录凭据
   * @returns 认证结果
   */
  private async realLogin(credentials: LoginCredentials): Promise<AuthResult> {
    const response = await this.fetchWithTimeout(
      this.apiUrl(this.config.apiEndpoints.login),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
        credentials: 'include'
      },
      this.callTimeout
    )

    if (!response.ok) {
      throw new Error(`登录失败: ${response.statusText}`)
    }

    return await response.json() as AuthResult
  }

  /**
   * 执行真实登出 API 调用
   *
   * @private
   */
  private async realLogout(): Promise<void> {
    const response = await this.fetchWithTimeout(
      this.apiUrl(this.config.apiEndpoints.logout),
      {
        method: 'POST',
        headers: this.getAuthHeaders(),
        credentials: 'include'
      },
      this.callTimeout
    )

    if (!response.ok) {
      throw new Error(`登出失败: ${response.statusText}`)
    }
  }

  /**
   * 执行真实认证检查 API 调用
   *
   * @private
   * @returns 认证结果
   */
  private async realCheckAuth(): Promise<AuthResult> {
    const response = await this.fetchWithTimeout(
      this.apiUrl(this.config.apiEndpoints.me),
      {
        method: 'GET',
        headers: this.getAuthHeaders(),
        credentials: 'include'
      },
      this.callTimeout
    )

    if (!response.ok) {
      throw new Error(`认证检查失败: ${response.statusText}`)
    }

    return await response.json() as AuthResult
  }

  // =============================================================================
  // 私有方法 - Mock 实现 (Private Methods - Mock)
  // =============================================================================

  /**
   * Mock 登录实现
   *
   * @private
   * @param credentials 登录凭据
   * @returns Mock 认证结果
   */
  private async mockLogin(credentials: LoginCredentials): Promise<AuthResult> {
    authLogger.debug('🎭 [Mock] 模拟登录', { username: credentials.username })

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, MOCK_DELAY_MS))

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
      env: this.buildMockEnv(),
      token: 'mock-token-' + Date.now()
    }
  }

  /**
   * Mock 认证检查实现
   *
   * @private
   * @returns Mock 认证结果
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- implements async interface contract; mock returns synchronously
  private async mockCheckAuth(): Promise<AuthResult> {
    authLogger.debug('🎭 [Mock] 模拟认证检查')

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
      env: this.buildMockEnv()
    }
  }
}

// =============================================================================
// 4. 工厂函数 (Factory Functions)
// =============================================================================

/**
 * 创建认证服务实例
 *
 * @returns 新的 AuthService 实例
 *
 * @example
 * ```typescript
 * // 推荐：用于依赖注入
 * const authService = createAuthService()
 * authService.initialize(config)
 * ```
 */
export function createAuthService(): IAuthService {
  return new AuthService()
}

/**
 * 全局认证服务实例
 *
 * @deprecated 推荐使用 createAuthService() 配合依赖注入
 *
 * @example
 * ```typescript
 * // 不推荐：全局单例
 * import { authService } from '@spark-view/spark-app'
 * authService.initialize(config)
 * ```
 */
export const authService = new AuthService()
