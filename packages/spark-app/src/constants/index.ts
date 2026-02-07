/**
 * 应用层符号常量表
 * L1 Application Layer Constants
 * 
 * 提供全局的 Symbol、枚举、错误码等常量定义
 */

import type { InjectionKey } from 'vue'
import type { Router } from 'vue-router'
import type { AppContext } from '../types'
import type { IAuthService } from '../auth/types'

// 外部类型（延迟导入）
type Logger = ReturnType<typeof import('../logger').createLogger>
type SparkRegistry = import('@spark-view/spark-component').ComponentRegistry
type ConfigLoader = import('@spark-view/spark-page-config').PageConfigLoader

/**
 * ============================================
 * 依赖注入 Symbol Keys（Injection Keys）
 * ============================================
 */

/**
 * AppContext 注入键
 */
export const APP_CONTEXT_KEY: InjectionKey<AppContext> = Symbol('AppContext')

/**
 * Router 注入键
 */
export const ROUTER_KEY: InjectionKey<Router> = Symbol('Router')

/**
 * Logger 注入键
 */
export const LOGGER_KEY: InjectionKey<Logger> = Symbol('Logger')

/**
 * ConfigLoader 注入键
 */
export const CONFIG_LOADER_KEY: InjectionKey<ConfigLoader> = Symbol('ConfigLoader')

/**
 * SparkRegistry 注入键
 */
export const SPARK_REGISTRY_KEY: InjectionKey<SparkRegistry> = Symbol('SparkRegistry')

/**
 * AuthService 注入键
 */
export const AUTH_SERVICE_KEY: InjectionKey<IAuthService> = Symbol('AuthService')

/**
 * ============================================
 * 错误码定义
 * ============================================
 */

export const ErrorCodes = {
  // 认证相关 (1xxx)
  AUTH_REQUIRED: 1001,
  AUTH_TOKEN_EXPIRED: 1002,
  AUTH_TOKEN_INVALID: 1003,
  AUTH_LOGIN_FAILED: 1004,
  
  // 权限相关 (2xxx)
  PERMISSION_DENIED: 2001,
  PERMISSION_INSUFFICIENT: 2002,
  PERMISSION_NOT_FOUND: 2003,
  
  // 网络相关 (3xxx)
  NETWORK_ERROR: 3001,
  NETWORK_TIMEOUT: 3002,
  NETWORK_OFFLINE: 3003,
  NETWORK_REQUEST_FAILED: 3004, // 添加：网络请求失败
  
  // 配置相关 (4xxx)
  CONFIG_LOAD_FAILED: 4001,
  CONFIG_INVALID: 4002,
  CONFIG_NOT_FOUND: 4003,
  
  // 路由相关 (5xxx)
  ROUTE_NOT_FOUND: 5001,
  ROUTE_INVALID: 5002,
  ROUTE_REDIRECT_FAILED: 5003,
  
  // 数据相关 (6xxx)
  DATA_LOAD_FAILED: 6001,
  DATA_SAVE_FAILED: 6002,
  DATA_VALIDATION_FAILED: 6003,
  
  // 系统相关 (9xxx)
  UNKNOWN_ERROR: 9999
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * ============================================
 * Bootstrap 阶段常量
 * @internal 仅供内部 bootstrap 流程使用
 * ============================================
 */

export const BootstrapPhases = {
  CONFIG: 'config',
  AUTH: 'auth',
  SERVICES: 'services',
  ROUTER: 'router',
  MOUNT: 'mount',
  COMPLETE: 'complete'
} as const

export type BootstrapPhase = typeof BootstrapPhases[keyof typeof BootstrapPhases]

/**
 * ============================================
 * 环境常量
 * ============================================
 */

export const Environments = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test'
} as const

export type Environment = typeof Environments[keyof typeof Environments]

/**
 * ============================================
 * 日志级别常量
 * @internal 主要供日志系统内部使用
 * @deprecated 推荐直接使用字符串字面量类型
 * ============================================
 */

export const LogLevels = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SUCCESS: 'success'
} as const

export type LogLevel = typeof LogLevels[keyof typeof LogLevels]

/**
 * ============================================
 * 权限操作常量
 * @internal 预留未来权限系统使用
 * ============================================
 */

export const PermissionActions = {
  VIEW: 'view',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  IMPORT: 'import',
  APPROVE: 'approve',
  REJECT: 'reject'
} as const

export type PermissionAction = typeof PermissionActions[keyof typeof PermissionActions]

/**
 * ============================================
 * 资源类型常量
 * @internal 预留未来权限系统使用
 * ============================================
 */

export const ResourceTypes = {
  PAGE: 'page',
  MENU: 'menu',
  BUTTON: 'button',
  API: 'api',
  DATA: 'data'
} as const

export type ResourceType = typeof ResourceTypes[keyof typeof ResourceTypes]

/**
 * ============================================
 * HTTP 状态码常量
 * ============================================
 */

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TIMEOUT: 408,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const

export type HttpStatusCode = typeof HttpStatus[keyof typeof HttpStatus]

/**
 * ============================================
 * 本地存储键名常量
 * @internal 主要供内部模块使用（AuthService, TokenManager 等）
 * ============================================
 */

export const StorageKeys = {
  // 认证相关
  AUTH_TOKEN: 'spark_auth_token',
  REFRESH_TOKEN: 'spark_refresh_token',
  USER_INFO: 'spark_user_info',
  
  // 应用配置
  APP_CONFIG: 'spark_app_config',
  APP_THEME: 'spark_app_theme',
  APP_LANG: 'spark_app_lang',
  
  // 页面状态
  PAGE_CACHE: 'spark_page_cache',
  ROUTE_HISTORY: 'spark_route_history',
  
  // 用户偏好
  USER_PREFERENCES: 'spark_user_preferences',
  TABLE_SETTINGS: 'spark_table_settings'
} as const

export type StorageKey = typeof StorageKeys[keyof typeof StorageKeys]

/**
 * ============================================
 * 事件名称常量
 * @internal 预留未来事件系统使用
 * @deprecated AppEventBus 已移除，暂无事件系统
 * ============================================
 */

export const AppEvents = {
  // 应用生命周期
  APP_INIT: 'app:init',
  APP_READY: 'app:ready',
  APP_ERROR: 'app:error',
  
  // 用户相关
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  USER_UPDATED: 'user:updated',
  
  // 路由相关
  ROUTE_BEFORE_CHANGE: 'route:beforeChange',
  ROUTE_AFTER_CHANGE: 'route:afterChange',
  ROUTE_ERROR: 'route:error',
  
  // 配置相关
  CONFIG_LOADED: 'config:loaded',
  CONFIG_UPDATED: 'config:updated',
  
  // 主题相关
  THEME_CHANGED: 'theme:changed',
  LANG_CHANGED: 'lang:changed'
} as const

export type AppEvent = typeof AppEvents[keyof typeof AppEvents]

/**
 * ============================================
 * 配置源类型常量
 * @internal 主要供配置加载器内部使用
 * ============================================
 */

export const ConfigSources = {
  LOCAL: 'local',
  REMOTE: 'remote',
  HYBRID: 'hybrid'
} as const

export type ConfigSource = typeof ConfigSources[keyof typeof ConfigSources]

/**
 * ============================================
 * 默认配置值
 * ============================================
 */

export const DefaultConfig = {
  // 应用配置
  APP_NAME: 'SPARK View',
  APP_VERSION: '1.0.0',
  
  // 超时配置
  REQUEST_TIMEOUT: 10000,      // 10秒
  ROUTE_TIMEOUT: 3000,         // 3秒
  CONFIG_CACHE_EXPIRY: 300000, // 5分钟
  
  // 分页配置
  PAGE_SIZE: 20,
  PAGE_SIZES: [10, 20, 50, 100],
  
  // 日志配置
  LOG_LEVEL: 'info',
  LOG_MAX_ENTRIES: 1000,
  
  // 路由配置
  LOGIN_PATH: '/login',
  HOME_PATH: '/',
  NOT_FOUND_PATH: '/404'
} as const

/**
 * ============================================
 * 正则表达式常量
 * ============================================
 */

export const Patterns = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^1[3-9]\d{9}$/,
  ID_CARD: /^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/,
  PASSWORD: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  URL: /^https?:\/\/.+/,
  PERMISSION: /^[a-z]+:[a-z]+$/  // 格式: resource:action
} as const

/**
 * ============================================
 * 工具函数
 * ============================================
 */

/**
 * 判断是否为生产环境
 */
export function isProduction(): boolean {
  return import.meta.env.MODE === Environments.PRODUCTION
}

/**
 * 判断是否为开发环境
 */
export function isDevelopment(): boolean {
  return import.meta.env.MODE === Environments.DEVELOPMENT
}

/**
 * 获取错误消息
 */
export function getErrorMessage(code: ErrorCode): string {
  const messages: Record<number, string> = {
    [ErrorCodes.AUTH_REQUIRED]: '需要登录',
    [ErrorCodes.AUTH_TOKEN_EXPIRED]: '登录已过期',
    [ErrorCodes.AUTH_TOKEN_INVALID]: '登录凭证无效',
    [ErrorCodes.AUTH_LOGIN_FAILED]: '登录失败',
    
    [ErrorCodes.PERMISSION_DENIED]: '权限不足',
    [ErrorCodes.PERMISSION_INSUFFICIENT]: '权限不足',
    [ErrorCodes.PERMISSION_NOT_FOUND]: '权限未找到',
    
    [ErrorCodes.NETWORK_ERROR]: '网络错误',
    [ErrorCodes.NETWORK_TIMEOUT]: '请求超时',
    [ErrorCodes.NETWORK_OFFLINE]: '网络未连接',
    
    [ErrorCodes.CONFIG_LOAD_FAILED]: '配置加载失败',
    [ErrorCodes.CONFIG_INVALID]: '配置无效',
    [ErrorCodes.CONFIG_NOT_FOUND]: '配置未找到',
    
    [ErrorCodes.ROUTE_NOT_FOUND]: '页面未找到',
    [ErrorCodes.ROUTE_INVALID]: '路由无效',
    [ErrorCodes.ROUTE_REDIRECT_FAILED]: '跳转失败',
    
    [ErrorCodes.DATA_LOAD_FAILED]: '数据加载失败',
    [ErrorCodes.DATA_SAVE_FAILED]: '数据保存失败',
    [ErrorCodes.DATA_VALIDATION_FAILED]: '数据验证失败',
    
    [ErrorCodes.UNKNOWN_ERROR]: '未知错误'
  }
  
  return messages[code] ?? '未知错误'
}

/**
 * 验证权限格式
 */
export function isValidPermission(permission: string): boolean {
  return Patterns.PERMISSION.test(permission)
}

/**
 * 从本地存储获取值
 */
export function getStorageItem<T = string>(key: StorageKey): T | null {
  if (typeof localStorage === 'undefined') return null
  
  try {
    const value = localStorage.getItem(key)
    if (!value) return null
    
    // 尝试解析 JSON
    try {
      return JSON.parse(value) as T
    } catch {
      return value as T
    }
  } catch {
    return null
  }
}

/**
 * 存储值到本地存储
 */
export function setStorageItem(key: StorageKey, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  
  try {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, strValue)
  } catch (error) {
    // Fallback to console when storage fails (SSR safe)
    console.error('存储失败:', error)
  }
}

/**
 * 从本地存储移除值
 */
export function removeStorageItem(key: StorageKey): void {
  if (typeof localStorage === 'undefined') return
  
  try {
    localStorage.removeItem(key)
  } catch (error) {
    // Fallback to console when storage fails (SSR safe)
    console.error('移除失败:', error)
  }
}
