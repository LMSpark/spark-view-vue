/**
 * @module @spark-appworks/spark-app:config/types
 * 职责：提供 spark-app 应用壳中的 types 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 应用配置类型定义
 * 支持多租户配置
 *
 * PluginConfigItem 复用本包的定义，不重复声明。
 */

import type { AppLoggerConfig } from '../logger'
import type { PluginConfigItem } from '../plugins'

/**
 * 配置源类型
 */
export type ConfigSourceOptions = {
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
  }}

/**
 * 租户信息（完整版，含 logo/theme 等展示字段）
 */
export type FullTenantInfo = {
    /** tenant Id 标识。 */
tenantId: string
    /** tenant Name 名称。 */
tenantName: string
    /** tenant Code 字段。 */
tenantCode?: string
    /** logo 字段。 */
logo?: string
    /** theme 字段。 */
theme?: {
    primaryColor?: string
    [key: string]: unknown
  }}

/**
 * 完整的应用配置
 */
export type AppFullConfig = {
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
  plugins: Record<string, boolean | PluginConfigItem>

  /** SPARK 组件系统 */
  spark: { enabled: boolean }

  /** PageNode 运行配置 */
  pageNode: {
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
  logger: AppLoggerConfig}

/**
 * 租户配置（可覆盖默认配置的部分）
 */
export type TenantConfig = Partial<AppFullConfig> & {
    /** tenant 字段。 */
tenant: FullTenantInfo}
