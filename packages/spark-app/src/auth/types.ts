/**
 * @module @spark-appworks/spark-app:auth/types
 * 职责：提供 spark-app 应用壳中的 types 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 认证模块类型定义
 */

import type { UserInfo, TenantInfo, EnvironmentInfo } from '../types'
import type { Component } from 'vue'

/**
 * 登录凭证
 */
export type LoginCredentials = {
    /** username 字段。 */
username: string
    /** password 字段。 */
password: string
  [key: string]: unknown}

/**
 * 认证结果
 */
export type AuthResult = {
    /** user 字段。 */
user: UserInfo
    /** tenant 字段。 */
tenant: TenantInfo
    /** env 字段。 */
env: EnvironmentInfo
    /** token 字段。 */
token?: string}

/**
 * Token 存储类型
 */
export type TokenStorage = 'localStorage' | 'sessionStorage' | 'cookie' | 'memory'

/**
 * 认证配置
 */
export type AuthConfig = {
  /**
   * API 端点配置
   */
  apiEndpoints: {
    /** 登录接口 - POST */
    login: string | undefined
    /** 登出接口 - POST */
    logout: string | undefined
    /** 获取当前用户信息 - GET */
    me: string | undefined
    /** 刷新 Token - POST */
    refresh: string | undefined
  } | undefined

  /**
   * Token 存储方式
   * @default 'localStorage'
   */
  tokenStorage: TokenStorage | undefined

  /**
   * Token 存储键名
   * @default 'spark_token'
   */
  tokenKey: string | undefined

  /**
   * 登录页面路径
   * @default '/login'
   */
  loginPath: string | undefined

  /**
   * 登录页面组件（可选，如果提供则自动注册路由）
   */
  loginComponent: Component | (() => Promise<Component>) | undefined

  /**
   * 是否启用 Mock 模式（开发环境）
   * @default false
   */
  enableMock: boolean | undefined

  /**
   * Mock 用户数据（enableMock=true 时使用）
   */
  mockUser: UserInfo | undefined

  /**
   * Mock 租户数据
   */
  mockTenant: TenantInfo | undefined

  /**
   * 请求超时时间（毫秒）
   * @default 10000
   */
  timeout: number | undefined

  /**
   * API 基础路径
   */
  apiBaseUrl: string | undefined

  /**
   * 钩子函数
   */
  onLoginSuccess: ((user: UserInfo) => void | Promise<void>) | undefined
    /** on Logout Success 事件回调。 */
onLogoutSuccess: (() => void | Promise<void>) | undefined
    /** on Auth Error 事件回调。 */
onAuthError: ((error: Error) => void) | undefined
    /** on Token Refresh 事件回调。 */
onTokenRefresh: ((token: string) => void) | undefined}

