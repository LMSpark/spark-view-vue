/**
 * @fileoverview Token 管理器 - 统一的安全令牌存储和管理解决方案
 * @packageDocumentation
 *
 * TokenManager 提供了跨平台、多种存储方式的令牌管理功能，
 * 支持在客户端和服务端环境下的无缝切换。主要特性：
 *
 * - 多存储后端：localStorage、sessionStorage、cookie、内存存储
 * - 环境自适应：自动检测运行环境并选择合适的存储方式
 * - 类型安全：完整的 TypeScript 类型支持
 * - 错误处理：优雅的异常处理和降级机制
 *
 * @example
 * ```typescript
 * // 使用默认配置（localStorage）
 * const tokenManager = new TokenManager()
 *
 * // 设置令牌
 * tokenManager.setToken('your-jwt-token')
 *
 * // 获取令牌
 * const token = tokenManager.getToken()
 *
 * // 清除令牌
 * tokenManager.clearToken()
 *
 * // 使用自定义存储和键名
 * const customManager = new TokenManager('sessionStorage', 'my_app_token')
 * ```
 *
 * @author SPARK Team
 * @version 1.0.0
 * @since 2024
 */

import type { TokenStorage } from './types'
import { simpleEnvAdapter as envAdapter } from '../utils/simpleEnv'

/**
 * =============================================================================
 * 类型定义和常量
 * =============================================================================
 */

/**
 * Token 存储配置选项
 * 定义了支持的存储后端类型
 */
export type TokenStorageType = TokenStorage

/**
 * =============================================================================
 * TokenManager 类 - 核心令牌管理器
 * =============================================================================
 */

/**
 * 统一令牌管理器
 *
 * 提供跨平台的令牌存储、管理和检索功能。支持多种存储后端，
 * 自动适应不同的运行环境（浏览器、服务端、测试环境）。
 *
 * @class
 * @example
 * ```typescript
 * const manager = new TokenManager('localStorage', 'auth_token')
 * manager.setToken('jwt-token-here')
 * console.log(manager.getToken()) // 'jwt-token-here'
 * ```
 */
export class TokenManager {
  /**
   * 当前使用的存储类型
   * @private
   */
  private storage: TokenStorage

  /**
   * 令牌存储的键名
   * @private
   */
  private tokenKey: string

  /**
   * 内存存储映射表（用于服务端和测试环境）
   * @private
   */
  private memoryStore: Map<string, string> = new Map()

  /**
   * =============================================================================
   * 构造函数
   * =============================================================================
   */

  /**
   * 创建 TokenManager 实例
   *
   * @param storage - 存储类型，默认为 'localStorage'
   * @param tokenKey - 存储键名，默认为 'spark_token'
   *
   * @example
   * ```typescript
   * // 默认配置
   * const manager = new TokenManager()
   *
   * // 自定义存储类型
   * const sessionManager = new TokenManager('sessionStorage')
   *
   * // 自定义键名
   * const customManager = new TokenManager('cookie', 'my_app_token')
   * ```
   */
  constructor(storage: TokenStorage = 'localStorage', tokenKey: string = 'spark_token') {
    this.storage = storage
    this.tokenKey = tokenKey
  }

  /**
   * =============================================================================
   * 公共 API 方法
   * =============================================================================
   */

  /**
   * 获取当前存储的令牌
   *
   * 根据配置的存储类型和当前运行环境，检索存储的令牌。
   * 在服务端或测试环境中自动使用内存存储。
   *
   * @returns {string | null} 令牌字符串或 null（如果不存在）
   *
   * @example
   * ```typescript
   * const token = tokenManager.getToken()
   * if (token) {
   *   console.log('Token found:', token)
   * } else {
   *   console.log('No token stored')
   * }
   * ```
   */
  getToken(): string | null {
    const env = envAdapter.getEnvironment()

    // 服务端或测试环境使用内存存储，避免依赖浏览器 API
    if (env.isServer || env.isTest) {
      return this.memoryStore.get(this.tokenKey) ?? null
    }

    // 根据配置的存储类型调用相应的获取方法
    switch (this.storage) {
      case 'localStorage':
        return this.getFromLocalStorage()

      case 'sessionStorage':
        return this.getFromSessionStorage()

      case 'cookie':
        return this.getFromCookie()

      case 'memory':
        return this.memoryStore.get(this.tokenKey) ?? null

      default:
        return null
    }
  }

  /**
   * 设置令牌到存储中
   *
   * 将令牌存储到配置的存储后端。在服务端或测试环境中
   * 自动使用内存存储。
   *
   * @param token - 要存储的令牌字符串
   *
   * @example
   * ```typescript
   * tokenManager.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
   * console.log('Token stored successfully')
   * ```
   */
  setToken(token: string): void {
    const env = envAdapter.getEnvironment()

    // 服务端或测试环境使用内存存储
    if (env.isServer || env.isTest) {
      this.memoryStore.set(this.tokenKey, token)
      return
    }

    // 根据配置的存储类型调用相应的设置方法
    switch (this.storage) {
      case 'localStorage':
        this.setToLocalStorage(token)
        break

      case 'sessionStorage':
        this.setToSessionStorage(token)
        break

      case 'cookie':
        this.setToCookie(token)
        break

      case 'memory':
        this.memoryStore.set(this.tokenKey, token)
        break
    }
  }

  /**
   * 清除存储的令牌
   *
   * 从当前存储后端中移除令牌。在服务端或测试环境中
   * 清除内存存储。
   *
   * @example
   * ```typescript
   * tokenManager.clearToken()
   * console.log('Token cleared')
   * ```
   */
  clearToken(): void {
    const env = envAdapter.getEnvironment()

    // 服务端或测试环境清除内存存储
    if (env.isServer || env.isTest) {
      this.memoryStore.delete(this.tokenKey)
      return
    }

    // 根据配置的存储类型调用相应的清除方法
    switch (this.storage) {
      case 'localStorage':
        this.clearFromLocalStorage()
        break

      case 'sessionStorage':
        this.clearFromSessionStorage()
        break

      case 'cookie':
        this.clearFromCookie()
        break

      case 'memory':
        this.memoryStore.delete(this.tokenKey)
        break
    }
  }

  /**
   * =============================================================================
   * localStorage 存储实现
   * =============================================================================
   */

  /**
   * 从 localStorage 获取令牌
   * @private
   * @returns {string | null} 令牌字符串或 null
   */
  private getFromLocalStorage(): string | null {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return null

    const adapter = envAdapter as { localStorage?: Storage }
    return adapter.localStorage?.getItem(this.tokenKey) ?? null
  }

  /**
   * 设置令牌到 localStorage
   * @private
   * @param token - 要存储的令牌
   */
  private setToLocalStorage(token: string): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return

    const adapter = envAdapter as { localStorage?: Storage }
    adapter.localStorage?.setItem(this.tokenKey, token)
  }

  /**
   * 从 localStorage 清除令牌
   * @private
   */
  private clearFromLocalStorage(): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return

    const adapter = envAdapter as { localStorage?: Storage }
    adapter.localStorage?.removeItem(this.tokenKey)
  }

  /**
   * =============================================================================
   * sessionStorage 存储实现
   * =============================================================================
   */

  /**
   * 从 sessionStorage 获取令牌
   * @private
   * @returns {string | null} 令牌字符串或 null
   */
  private getFromSessionStorage(): string | null {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return null

    const adapter = envAdapter as { sessionStorage?: Storage }
    return adapter.sessionStorage?.getItem(this.tokenKey) ?? null
  }

  /**
   * 设置令牌到 sessionStorage
   * @private
   * @param token - 要存储的令牌
   */
  private setToSessionStorage(token: string): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return

    const adapter = envAdapter as { sessionStorage?: Storage }
    adapter.sessionStorage?.setItem(this.tokenKey, token)
  }

  /**
   * 从 sessionStorage 清除令牌
   * @private
   */
  private clearFromSessionStorage(): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return

    const adapter = envAdapter as { sessionStorage?: Storage }
    adapter.sessionStorage?.removeItem(this.tokenKey)
  }

  /**
   * =============================================================================
   * Cookie 存储实现
   * =============================================================================
   */

  /**
   * 从 Cookie 获取令牌
   *
   * 解析 document.cookie 字符串，查找指定键名的令牌。
   * 自动处理 URL 编码/解码。
   *
   * @private
   * @returns {string | null} 令牌字符串或 null
   */
  private getFromCookie(): string | null {
    const env = envAdapter.getEnvironment()
    if (env.isServer || typeof document === 'undefined') return null

    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=')
      if (name === this.tokenKey && value) {
        return decodeURIComponent(value)
      }
    }
    return null
  }

  /**
   * 设置令牌到 Cookie
   *
   * 将令牌存储为 Cookie，默认过期时间为 30 天。
   * 自动处理 URL 编码。
   *
   * @private
   * @param token - 要存储的令牌
   */
  private setToCookie(token: string): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer || typeof document === 'undefined') return

    const expires = new Date()
    expires.setDate(expires.getDate() + 30) // 30 天后过期

    document.cookie = `${this.tokenKey}=${encodeURIComponent(token)}; expires=${expires.toUTCString()}; path=/`
  }

  /**
   * 从 Cookie 清除令牌
   *
   * 通过设置过期时间为过去的时间来删除 Cookie。
   *
   * @private
   */
  private clearFromCookie(): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer || typeof document === 'undefined') return

    // 设置过期时间为过去的时间来删除 cookie
    document.cookie = `${this.tokenKey}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
  }
}
