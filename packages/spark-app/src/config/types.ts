/**
 * 应用配置类型定义
 * 支持多租户配置
 *
 * PluginConfigItem / PluginConfig 复用本包的定义，不重复声明。
 */

import type { AppLoggerConfig } from '../logger'
import type { PluginConfig } from '../plugins'

/**
 * 配置源类型
 */
export interface ConfigSourceOptions {
  /** 配置源类型 */
  type: 'local' | 'remote'

  /** API 端点配置（远程加载） */
  api?: {
    defaultConfigEndpoint: string
    tenantConfigEndpoint: string
    timeout?: number
    headers?: Record<string, string>
  }

  /** 本地文件路径配置 */
  local?: {
    defaultConfigPath: string
    tenantConfigTemplate: string
  }

}

/**
 * 租户信息（完整版，含 logo/theme 等展示字段）
 */
export interface FullTenantInfo {
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
  tenant?: FullTenantInfo

  /** 路由配置 */
  router: {
    mode: 'history' | 'hash'
    base?: string
  }

  /** 挂载点 */
  mountTarget: string

  /** UI 插件配置（简单: true / 详细: PluginConfigItem） */
  plugins: Record<string, PluginConfig>

  /** SPARK 组件系统 */
  spark: { enabled: boolean }

  /** 页面配置系统 */
  pageConfig: {
    apiBaseUrl: string
    timeout?: number
    homePath: string
  }

  /** 应用基础配置 */
  config: {
    apiBaseUrl: string
    logLevel: 'debug' | 'info' | 'warn' | 'error'
    enableMock?: boolean
    version: string
    features: {
      enableExport?: boolean
      enableOffline?: boolean
    }
  }

  /** Logger 配置 */
  logger: AppLoggerConfig
}

/**
 * 租户配置（可覆盖默认配置的部分）
 */
export type TenantConfig = Partial<AppFullConfig> & {
  tenant: FullTenantInfo
}
