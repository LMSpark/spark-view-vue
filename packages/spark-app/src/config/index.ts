/**
 * Configuration Manager
 * 配置管理（环境变量 + 远程配置 + 多租户）
 */

import type { AppConfig } from '../types'
import { createLogger } from '../logger'
import { toErrorMessage, createRequest } from '@spark-view/spark-utils'

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
    enableAI: false,
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
  try {
    const client = createRequest({ timeout: 10_000 })
    const body = await client.get<unknown>('/api/config')
    if (typeof body !== 'object' || body === null) {
      throw new Error('配置接口返回了非对象数据')
    }
    return body as Partial<AppConfig>
  } catch (error) {
    throw error
  }
}

/**
 * 获取功能开关
 */
export function isFeatureEnabled(config: AppConfig, feature: keyof AppConfig['features']): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- features 可选，?. 结果可能为 undefined
  return config.features?.[feature] ?? false
}
