/**
 * @module @spark-appworks/spark-app:config/index
 * 职责：提供 spark-app 应用壳中的 index 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * Configuration Manager
 * 配置管理（环境变量 + 远程配置 + 多租户）
 */

import type { AppConfig } from '../types'
import { createLogger } from '../logger'
import { toErrorMessage, createRequest, isRecord } from '@spark-appworks/spark-utils'
import { readProperty } from '@spark-appworks/spark-utils/internal'

// ── 多租户配置系统（从 loader.ts 导出） ──
export { ConfigLoader, TenantResolver, loadAppConfig } from './loader'
export type { AppFullConfig, TenantConfig, ConfigSourceOptions, FullTenantInfo } from './types'

const configLogger = createLogger('config')

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  logLevel: 'info',
  enableMock: false,
  enableRemoteConfig: false,
  version: '0.1.0',
  features: {
    enableExport: true,
    enableOffline: false
  }
}

/**
 * 加载配置
 */
export async function loadConfig(envConfig?: Partial<AppConfig>): Promise<AppConfig> {
  // 1. 合并环境变量配置
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    ...envConfig
  }

  // 2. 尝试加载远程配置（可选）
  if (config.enableRemoteConfig !== false) {
    try {
      const remoteConfig = await fetchRemoteConfig()
      Object.assign(config, remoteConfig)
      configLogger.info('远程配置已加载', remoteConfig)
    } catch (error) {
      const errorMessage = toErrorMessage(error)
      configLogger.debug('远程配置不可用，使用本地配置', { reason: errorMessage })
    }
  }

  return config
}

/**
 * 获取远程配置
 */
async function fetchRemoteConfig(): Promise<Partial<AppConfig>> {
  const client = createRequest({ timeout: 10_000 })
  const body = await client.get<unknown>('/api/config')
  if (!isAppConfigPatch(body)) {
    throw new Error('配置接口返回了无效的应用配置')
  }
  return body
}

function isLogLevel(value: unknown): value is AppConfig['logLevel'] {
  return value === undefined
    || value === 'debug'
    || value === 'info'
    || value === 'warn'
    || value === 'error'
}

function isAppConfigPatch(value: unknown): value is Partial<AppConfig> {
  if (!isRecord(value)) return false

  const apiBaseUrl = readProperty(value, 'apiBaseUrl')
  if (apiBaseUrl !== undefined && typeof apiBaseUrl !== 'string') return false

  const logLevel = readProperty(value, 'logLevel')
  if (!isLogLevel(logLevel)) return false

  const enableMock = readProperty(value, 'enableMock')
  if (enableMock !== undefined && typeof enableMock !== 'boolean') return false

  const enableRemoteConfig = readProperty(value, 'enableRemoteConfig')
  if (enableRemoteConfig !== undefined && typeof enableRemoteConfig !== 'boolean') return false

  const version = readProperty(value, 'version')
  if (version !== undefined && typeof version !== 'string') return false

  const features = readProperty(value, 'features')
  if (features === undefined) return true
  if (!isRecord(features)) return false

  const enableExport = readProperty(features, 'enableExport')
  if (enableExport !== undefined && typeof enableExport !== 'boolean') return false

  const enableOffline = readProperty(features, 'enableOffline')
  return enableOffline === undefined || typeof enableOffline === 'boolean'
}

/**
 * 获取功能开关
 */
export function isFeatureEnabled(config: AppConfig, feature: keyof AppConfig['features']): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- features 可选，?. 结果可能为 undefined
  return config.features?.[feature] ?? false
}
