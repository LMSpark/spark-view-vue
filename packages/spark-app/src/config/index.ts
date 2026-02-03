/**
 * Configuration Manager
 * 配置管理（环境变量 + 远程配置）
 */

import type { AppConfig } from '../types'
import { createLogger } from '../logger'

const configLogger = createLogger('config')

/**
 * 默认配置
 */
const DEFAULT_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  logLevel: 'info',
  enableMock: false,
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

  // 2. 尝试加载远程配置
  try {
    const remoteConfig = await fetchRemoteConfig()
    Object.assign(config, remoteConfig)
    configLogger.info('远程配置已加载', remoteConfig)
  } catch (error) {
    configLogger.warn('远程配置加载失败，使用本地配置', { error: String(error) })
  }

  return config
}

/**
 * 获取远程配置
 */
async function fetchRemoteConfig(): Promise<Partial<AppConfig>> {
  const response = await fetch('/api/config', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return await response.json()
}

/**
 * 获取功能开关
 */
export function isFeatureEnabled(config: AppConfig, feature: keyof AppConfig['features']): boolean {
  return config.features?.[feature] ?? false
}
