/**
 * Token 管理器
 * 支持多种存储方式：localStorage, sessionStorage, cookie, memory
 */

import type { TokenStorage } from './types'
import { envAdapter } from '../environment'

/**
 * Token 管理器
 */
export class TokenManager {
  private storage: TokenStorage
  private tokenKey: string
  private memoryStore: Map<string, string> = new Map()

  constructor(storage: TokenStorage = 'localStorage', tokenKey: string = 'spark_token') {
    this.storage = storage
    this.tokenKey = tokenKey
  }

  /**
   * 获取 Token
   */
  getToken(): string | null {
    const env = envAdapter.getEnvironment()

    // 服务端或测试环境使用内存存储
    if (env.isServer || env.isTest) {
      return this.memoryStore.get(this.tokenKey) ?? null
    }

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
   * 设置 Token
   */
  setToken(token: string): void {
    const env = envAdapter.getEnvironment()

    // 服务端或测试环境使用内存存储
    if (env.isServer || env.isTest) {
      this.memoryStore.set(this.tokenKey, token)
      return
    }

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
   * 清除 Token
   */
  clearToken(): void {
    const env = envAdapter.getEnvironment()

    if (env.isServer || env.isTest) {
      this.memoryStore.delete(this.tokenKey)
      return
    }

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

  // ========== Private Methods ==========

  private getFromLocalStorage(): string | null {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return null
    const adapter = envAdapter as { localStorage?: Storage }
    return adapter.localStorage?.getItem(this.tokenKey) ?? null
  }

  private setToLocalStorage(token: string): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return
    const adapter = envAdapter as { localStorage?: Storage }
    adapter.localStorage?.setItem(this.tokenKey, token)
  }

  private clearFromLocalStorage(): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return
    const adapter = envAdapter as { localStorage?: Storage }
    adapter.localStorage?.removeItem(this.tokenKey)
  }

  private getFromSessionStorage(): string | null {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return null
    const adapter = envAdapter as { sessionStorage?: Storage }
    return adapter.sessionStorage?.getItem(this.tokenKey) ?? null
  }

  private setToSessionStorage(token: string): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return
    const adapter = envAdapter as { sessionStorage?: Storage }
    adapter.sessionStorage?.setItem(this.tokenKey, token)
  }

  private clearFromSessionStorage(): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer) return
    const adapter = envAdapter as { sessionStorage?: Storage }
    adapter.sessionStorage?.removeItem(this.tokenKey)
  }

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

  private setToCookie(token: string): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer || typeof document === 'undefined') return
    
    const expires = new Date()
    expires.setDate(expires.getDate() + 30)
    
    document.cookie = `${this.tokenKey}=${encodeURIComponent(token)}; expires=${expires.toUTCString()}; path=/`
  }

  private clearFromCookie(): void {
    const env = envAdapter.getEnvironment()
    if (env.isServer || typeof document === 'undefined') return

    document.cookie = `${this.tokenKey}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
  }
}
