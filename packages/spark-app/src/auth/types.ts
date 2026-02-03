/**
 * 认证模块类型定义
 */

import type { UserInfo, TenantInfo, EnvironmentInfo } from '../types'
import type { Component } from 'vue'

/**
 * 登录凭证
 */
export interface LoginCredentials {
  username: string
  password: string
  [key: string]: unknown
}

/**
 * 认证结果
 */
export interface AuthResult {
  user: UserInfo
  tenant: TenantInfo
  env: EnvironmentInfo
  token?: string
}

/**
 * Token 存储类型
 */
export type TokenStorage = 'localStorage' | 'sessionStorage' | 'cookie' | 'memory'

/**
 * 认证配置
 */
export interface AuthConfig {
  /**
   * API 端点配置
   */
  apiEndpoints?: {
    /** 登录接口 - POST */
    login?: string
    /** 登出接口 - POST */
    logout?: string
    /** 获取当前用户信息 - GET */
    me?: string
    /** 刷新 Token - POST */
    refresh?: string
  }

  /**
   * Token 存储方式
   * @default 'localStorage'
   */
  tokenStorage?: TokenStorage

  /**
   * Token 存储键名
   * @default 'spark_token'
   */
  tokenKey?: string

  /**
   * 登录页面路径
   * @default '/login'
   */
  loginPath?: string

  /**
   * 登录页面组件（可选，如果提供则自动注册路由）
   */
  loginComponent?: Component | (() => Promise<Component>)

  /**
   * 是否启用 Mock 模式（开发环境）
   * @default false
   */
  enableMock?: boolean

  /**
   * Mock 用户数据（enableMock=true 时使用）
   */
  mockUser?: UserInfo

  /**
   * Mock 租户数据
   */
  mockTenant?: TenantInfo

  /**
   * 请求超时时间（毫秒）
   * @default 10000
   */
  timeout?: number

  /**
   * API 基础路径
   */
  apiBaseUrl?: string

  /**
   * 钩子函数
   */
  onLoginSuccess?: (user: UserInfo) => void | Promise<void>
  onLogoutSuccess?: () => void | Promise<void>
  onAuthError?: (error: Error) => void
  onTokenRefresh?: (token: string) => void
}

/**
 * 认证服务接口
 */
export interface IAuthService {
  /**
   * 初始化认证服务
   */
  initialize(config: AuthConfig): void

  /**
   * 登录
   */
  login(credentials: LoginCredentials): Promise<AuthResult>

  /**
   * 登出
   */
  logout(): Promise<void>

  /**
   * 检查认证状态
   */
  checkAuth(): Promise<AuthResult | null>

  /**
   * 是否已认证
   */
  isAuthenticated(): boolean

  /**
   * 获取 Token
   */
  getToken(): string | null

  /**
   * 设置 Token
   */
  setToken(token: string): void

  /**
   * 清除 Token
   */
  clearToken(): void

  /**
   * 刷新 Token
   */
  refreshToken(): Promise<string>
}
