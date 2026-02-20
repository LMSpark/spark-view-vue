/**
 * 应用配置类型定义
 * 支持多租户配置
 */

import type { AppLoggerConfig } from '@spark-view/spark-app'

/**
 * 配置源类型
 */
export interface ConfigSourceOptions {
  /** 配置源类型 */
  type: 'local' | 'remote' | 'hybrid'
  
  /** API 端点配置（远程加载） */
  api?: {
    /** 默认配置端点 */
    defaultConfigEndpoint: string
    /** 租户配置端点（支持占位符 {tenantId}） */
    tenantConfigEndpoint: string
    /** 请求超时时间（毫秒） */
    timeout?: number
    /** 自定义请求头 */
    headers?: Record<string, string>
  }
  
  /** 本地文件路径配置 */
  local?: {
    /** 默认配置路径 */
    defaultConfigPath: string
    /** 租户配置路径模板 */
    tenantConfigTemplate: string
  }
  
  /** 降级策略 */
  fallback?: {
    /** 启用降级 */
    enabled: boolean
    /** 降级到本地文件 */
    useLocal: boolean
  }
}

/**
 * 路由配置
 */
export interface RouterConfig {
  mode: 'history' | 'hash'
  base?: string
}

/**
 * SPARK 组件系统配置
 */
export interface SparkConfig {
  enabled: boolean
}

/**
 * 页面配置系统配置
 */
export interface PageConfigOptions {
  source: 'local' | 'remote' | 'hybrid'
  apiBaseUrl: string
  timeout?: number
  homePath: string
}

/**
 * 应用基础配置
 */
export interface AppBaseConfig {
  apiBaseUrl: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  enableMock?: boolean
  version: string
  features: {
    enableAI?: boolean
    enableExport?: boolean
    enableOffline?: boolean
  }
}

/**
 * 插件配置项（支持简单布尔值或详细配置）
 */
export interface PluginConfigItem {
  /** 是否启用 */
  enabled: boolean
  /** 插件选项 */
  options?: Record<string, unknown>
  /** 是否懒加载 */
  lazy?: boolean
  /** 优先级（数字越小越先加载） */
  priority?: number
}

/**
 * UI 插件配置
 * 支持两种格式：
 * 1. 简单格式：{ "elementPlus": true }
 * 2. 详细格式：{ "elementPlus": { enabled: true, options: {...} } }
 */
export type UIPluginsConfig = Record<string, boolean | PluginConfigItem>

/**
 * 租户信息
 */
export interface TenantInfo {
  tenantId: string
  tenantName: string
  tenantCode?: string
  logo?: string
  theme?: {
    primaryColor?: string
    [key: string]: unknown
  }
}

/**
 * 完整的应用配置
 */
export interface AppFullConfig {
  /** 配置源设置 */
  configSource?: ConfigSourceOptions
  
  /** 租户信息 */
  tenant?: TenantInfo
  
  /** 路由配置 */
  router: RouterConfig
  
  /** 挂载点 */
  mountTarget: string
  
  /** UI 插件配置 */
  plugins: UIPluginsConfig
  
  /** SPARK 组件系统 */
  spark: SparkConfig
  
  /** 页面配置系统 */
  pageConfig: PageConfigOptions
  
  /** 应用基础配置 */
  config: AppBaseConfig
  
  /** Logger 配置 */
  logger: AppLoggerConfig
}

/**
 * 租户配置（可覆盖默认配置的部分）
 */
export type TenantConfig = Partial<AppFullConfig> & {
  tenant: TenantInfo
}
