/**
 * SPARK Application Layer Types
 * 应用层类型定义
 */

/**
 * 日志级别（从 spark-utils 统一导入）
 */
import type { LogLevel } from '@spark-view/spark-utils'
import type { App } from 'vue'
import type { Router } from 'vue-router'
import type { AuthConfig } from './auth'
import type { ThemeCapability } from './theme'
export type { LogLevel }

/**
 * 应用环境
 */
export type AppEnvironment = 'development' | 'production' | 'test'

/**
 * 用户信息
 */
export interface UserInfo {
  userId: string
  username: string
  displayName?: string
  email?: string
  avatar?: string
  readonly roles: string[]        // ['admin', 'sales', 'manager']
  readonly permissions: string[]  // ['order:create', 'user:read', 'report:export']
}

/**
 * 租户信息
 */
export interface TenantInfo {
  tenantId: string
  tenantName: string
  tenantCode?: string
  config?: Record<string, unknown>
  features?: string[]  // 租户启用的功能特性
}

/**
 * 环境信息
 */
export interface EnvironmentInfo {
  mode: AppEnvironment
  apiBaseUrl: string
  version: string
  buildTime?: string
}

/**
 * 应用全局上下文接口
 * 
 * 作用域：整个 SPA 应用
 * 生命周期：应用启动时创建，应用关闭时销毁（单例）
 * 
 * 用途：
 * - 存储应用级全局信息（用户、租户、环境）
 * - 提供跨页面共享的配置和状态
 * - 支持 SSR/CSR 环境检测
 * 
 * 注意：
 * - 此 Context 是应用级单例，所有页面共享
 * - 不应存储页面级状态，避免内存泄漏
 * - 通过依赖注入（DI）在需要时注入到组件中
 * 
 * 典型使用场景：
 * - 权限校验（基于 user/tenant）
 * - 环境判断（SSR vs CSR）
 * - 全局配置读取
 */
export interface AppContext {
  /** 用户信息 */
  user: UserInfo
  /** 租户信息 */
  tenant: TenantInfo
  /** 环境信息 */
  env: EnvironmentInfo
  /** 全局配置 */
  config: Record<string, unknown>
  /** 初始化时间 */
  initializedAt: string
}

/**
 * 应用配置
 */
export interface AppConfig {
  /** API 基础地址 */
  apiBaseUrl: string
  /** 日志级别 */
  logLevel?: LogLevel
  /** 是否启用 Mock */
  enableMock?: boolean
  /** 是否启用远程配置加载 */
  enableRemoteConfig?: boolean
  /** 应用版本 */
  version?: string
  /** 功能开关 */
  features?: {
    enableExport?: boolean
    enableOffline?: boolean
  }
}

/**
 * Bootstrap Context - 扩展 AppContext，包含 Vue 应用实例和路由
 */
export interface BootstrapContext extends AppContext {
  /** Vue 应用实例 */
  app: App
  /** Vue Router 实例 */
  router: Router
  /** 主题服务（仅在启用 theme 选项时存在） */
  theme?: ThemeCapability
}

/**
 * 初始化选项
 */
export interface BootstrapOptions {
  /** Vue 应用实例 */
  app: App
  /** Vue Router 实例 */
  router: Router
  /** 应用配置 */
  config: AppConfig
  /** 认证配置（可选，不提供则使用 authenticate 函数） */
  auth?: AuthConfig
  /** 挂载目标元素选择器（默认 '#app'） */
  mountTarget?: string
  /** 主题服务实例（由 start() 创建并传入，或手动传入） */
  themeService?: ThemeCapability
  /** 挂载前钩子 */
  beforeMount?: (context: BootstrapContext) => void | Promise<void>
  /** 挂载后钩子 */
  afterMount?: (context: BootstrapContext) => void | Promise<void>
}

/**
 * 路由守卫选项
 */
export interface RouterGuardOptions {
  /** 自定义权限检查 */
  checkPermission?: (permissions: string[], required: string[]) => boolean
}

/**
 * 错误处理选项
 */
export interface ErrorHandlerOptions {
  /** 错误回调 */
  onError?: (error: Error, context: ErrorContext) => void
  /** 自定义错误分类 */
  errorClassifier?: (error: Error) => ErrorType
  /** 错误类型处理回调（消费层实现 UI 交互） */
  onErrorByType?: (type: ErrorType, error: Error) => void
}

/**
 * 错误上下文接口
 * 
 * 作用域：单次错误发生时的临时上下文
 * 生命周期：错误捕获时创建，用于错误日志记录和上报
 * 
 * 用途：
 * - 记录错误发生的位置和时间
 * - 为错误监控和追踪提供结构化信息
 * - 支持错误日志聚合和分析
 * 
 * 典型使用场景：
 * - 组件渲染失败时记录 source
 * - API 请求错误时记录 info 和 timestamp
 * - 用户操作异常时进行错误上报
 */
export interface ErrorContext {
  /** 错误来源（组件名） */
  source?: string
  /** 组件文件路径（Vue SFC __file） */
  file?: string
  /** 错误信息 */
  info: string
  /** 时间戳 */
  timestamp: number
}

/**
 * 错误类型
 */
export enum ErrorType {
  Auth = 'AUTH',
  Permission = 'PERMISSION',
  Network = 'NETWORK',
  Validation = 'VALIDATION',
  Unknown = 'UNKNOWN'
}

