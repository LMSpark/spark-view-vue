/**
 * @module @spark-appworks/spark-app:config/loader
 * 职责：提供 spark-app 应用壳中的 loader 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * 多租户配置加载器
 *
 * 功能：
 * 1. 从 JSON 文件或 API 加载默认配置
 * 2. 根据租户 ID 加载租户特定配置
 * 3. 合并配置（深度合并）
 * 4. 支持环境变量覆盖
 * 5. 支持远程 API 或本地文件两种模式
 */

import type { AppFullConfig, TenantConfig, ConfigSourceOptions } from './types'
import { createLogger } from '../logger'
import { createRequest, isRecord } from '@spark-appworks/spark-utils'
import { readBooleanProperty, readNumberProperty, readProperty, readStringProperty } from '@spark-appworks/spark-utils/internal'

const configLogger = createLogger('config')

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isConfigSourceOptions(value: unknown): value is ConfigSourceOptions {
  if (!isRecord(value)) return false
  const type = readProperty(value, 'type')
  if (type !== 'local' && type !== 'remote') return false

  const api = readProperty(value, 'api')
  if (api !== undefined) {
    if (!isRecord(api)) return false
    if (readStringProperty(api, 'defaultConfigEndpoint') === undefined) return false
    if (readStringProperty(api, 'tenantConfigEndpoint') === undefined) return false
    const timeout = readProperty(api, 'timeout')
    if (timeout !== undefined && typeof timeout !== 'number') return false
    const headers = readProperty(api, 'headers')
    if (headers !== undefined && !isStringRecord(headers)) return false
  }

  const local = readProperty(value, 'local')
  if (local !== undefined) {
    if (!isRecord(local)) return false
    if (readStringProperty(local, 'defaultConfigPath') === undefined) return false
    if (readStringProperty(local, 'tenantConfigTemplate') === undefined) return false
  }

  return true
}

function isFullTenantInfo(value: unknown): boolean {
  return isRecord(value)
    && readStringProperty(value, 'tenantId') !== undefined
    && readStringProperty(value, 'tenantName') !== undefined
}

function isRouterConfig(value: unknown): boolean {
  if (!isRecord(value)) return false
  const mode = readProperty(value, 'mode')
  return mode === 'history' || mode === 'hash'
}

function isSparkConfig(value: unknown): boolean {
  return isRecord(value) && typeof readProperty(value, 'enabled') === 'boolean'
}

function isPageNodeConfig(value: unknown): boolean {
  return isRecord(value)
    && readStringProperty(value, 'apiBaseUrl') !== undefined
    && readStringProperty(value, 'homePath') !== undefined
}

function isAppBaseConfig(value: unknown): boolean {
  if (!isRecord(value)) return false
  const logLevel = readProperty(value, 'logLevel')
  return readStringProperty(value, 'apiBaseUrl') !== undefined
    && (logLevel === 'debug' || logLevel === 'info' || logLevel === 'warn' || logLevel === 'error')
    && readStringProperty(value, 'version') !== undefined
    && isRecord(readProperty(value, 'features'))
}

function isLoggerConfig(value: unknown): boolean {
  if (!isRecord(value)) return false
  const level = readProperty(value, 'level')
  if (level !== undefined && level !== 'debug' && level !== 'info' && level !== 'warn' && level !== 'error') return false
  const enableColors = readBooleanProperty(value, 'enableColors')
  if (readProperty(value, 'enableColors') !== undefined && enableColors === undefined) return false
  const showTimestamp = readBooleanProperty(value, 'showTimestamp')
  if (readProperty(value, 'showTimestamp') !== undefined && showTimestamp === undefined) return false
  const batchSize = readNumberProperty(value, 'batchSize')
  if (readProperty(value, 'batchSize') !== undefined && batchSize === undefined) return false
  return true
}

function isAppFullConfig(value: unknown): value is AppFullConfig {
  if (!isRecord(value)) return false

  const configSource = readProperty(value, 'configSource')
  if (configSource !== undefined && !isConfigSourceOptions(configSource)) return false

  const tenant = readProperty(value, 'tenant')
  if (tenant !== undefined && !isFullTenantInfo(tenant)) return false

  return isRouterConfig(readProperty(value, 'router'))
    && readStringProperty(value, 'mountTarget') !== undefined
    && isRecord(readProperty(value, 'plugins'))
    && isSparkConfig(readProperty(value, 'spark'))
    && isPageNodeConfig(readProperty(value, 'pageNode'))
    && isAppBaseConfig(readProperty(value, 'config'))
    && isLoggerConfig(readProperty(value, 'logger'))
}

function parseAppFullConfig(value: unknown, source: string): AppFullConfig {
  if (isAppFullConfig(value)) return value
  throw new Error(`${source} 不是有效的 AppFullConfig`)
}

function isTenantConfig(value: unknown): value is TenantConfig {
  return isRecord(value) && isFullTenantInfo(readProperty(value, 'tenant'))
}

function parseTenantConfig(value: unknown, source: string): TenantConfig {
  if (isTenantConfig(value)) return value
  throw new Error(`${source} 不是有效的 TenantConfig`)
}

/**
 * 配置加载器
 */
export class ConfigLoader {
  private static instance: ConfigLoader
  private cache = new Map<string, AppFullConfig>()
  private configSource?: ConfigSourceOptions

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ConfigLoader {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition -- static property 可为 undefined
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader()
    }
    return ConfigLoader.instance
  }

  /**
   * 从远程 API 获取配置
   */
  private async fetchFromAPI(url: string, timeout = 5000): Promise<unknown> {
    const client = createRequest({ timeout })
    const headers = this.configSource?.api?.headers ?? {}
    return await client.get<unknown>(url, undefined, { headers })
  }

  /**
   * 从本地文件获取配置
   */
  private async fetchFromLocal(path: string): Promise<unknown> {
    const client = createRequest()
    return await client.get<unknown>(path)
  }

  /**
   * 加载默认配置
   */
  async loadDefaultConfig(): Promise<AppFullConfig> {
    try {
      // 首次加载：从本地获取配置源设置
      if (!this.configSource) {
        const localConfig = parseAppFullConfig(
          await this.fetchFromLocal('/config/default.json'),
          '/config/default.json',
        )
        if (localConfig.configSource) {
          this.configSource = localConfig.configSource
        }

        // 如果配置源是 local，直接返回本地配置
        if (this.configSource?.type === 'local') {
          return this.applyEnvironmentOverrides(localConfig)
        }
      }

      let config: AppFullConfig | null = null

      // 远程模式：从 API 加载
      if (this.configSource?.type === 'remote') {
        try {
          const apiEndpoint = this.configSource.api?.defaultConfigEndpoint
          const timeout = this.configSource.api?.timeout ?? 5000

          if (apiEndpoint) {
            configLogger.info(`Loading default config from API: ${apiEndpoint}`)
            config = parseAppFullConfig(
              await this.fetchFromAPI(apiEndpoint, timeout),
              apiEndpoint,
            )
            configLogger.info('Default config loaded from API')
          }
        } catch (error) {
          configLogger.warn('Failed to load default config from API', { error: String(error) })
          throw error
        }
      }

      // 本地模式：从本地文件加载
      if (!config && this.configSource?.type === 'local') {
        const localPath = this.configSource.local?.defaultConfigPath ?? '/config/default.json'
        configLogger.info(`Loading default config from local: ${localPath}`)
        config = parseAppFullConfig(await this.fetchFromLocal(localPath), localPath)
        configLogger.info('Default config loaded from local file')
      }

      if (!config) {
        throw new Error('No config source available')
      }

      // 应用环境变量覆盖
      return this.applyEnvironmentOverrides(config)
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('❌ Failed to load default config:', error)
      }
      // 返回最小可用配置
      return this.getMinimalConfig()
    }
  }

  /**
   * 加载租户配置
   */
  async loadTenantConfig(tenantId: string): Promise<TenantConfig | null> {
    try {
      let config: TenantConfig | null = null

      // 远程模式：从 API 加载
      if (this.configSource?.type === 'remote') {
        try {
          const apiEndpoint = this.configSource.api?.tenantConfigEndpoint.replace('{tenantId}', tenantId)
          const timeout = this.configSource.api?.timeout ?? 5000

          if (apiEndpoint) {
            configLogger.info(`Loading tenant config from API: ${apiEndpoint}`)
            config = parseTenantConfig(
              await this.fetchFromAPI(apiEndpoint, timeout),
              apiEndpoint,
            )
            configLogger.info(`Tenant config loaded from API for: ${tenantId}`)
          }
        } catch (error) {
          configLogger.warn(`Failed to load tenant config from API for ${tenantId}`, { error: String(error) })
          return null
        }
      }

      // 本地模式：从本地文件加载
      if (!config && this.configSource?.type === 'local') {
        const template = this.configSource.local?.tenantConfigTemplate
        const localPath = template !== undefined
          ? template.replace('{tenantId}', tenantId)
          : `/config/tenants/tenant-${tenantId}.json`

        configLogger.info(`Loading tenant config from local: ${localPath}`)
        try {
          config = parseTenantConfig(await this.fetchFromLocal(localPath), localPath)
          configLogger.info(`Tenant config loaded from local file for: ${tenantId}`)
        } catch {
          configLogger.warn(`No local tenant config found for ${tenantId}`)
          return null
        }
      }

      return config
    } catch (error) {
      configLogger.warn(`Failed to load tenant config for ${tenantId}`, { error: String(error) })
      return null
    }
  }

  /**
   * 加载完整配置（默认 + 租户）
   */
  async loadConfig(tenantId?: string): Promise<AppFullConfig> {
    // 检查缓存
    const cacheKey = tenantId ?? 'default'
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    // 加载默认配置
    const defaultConfig = await this.loadDefaultConfig()

    // 如果没有租户 ID，直接返回默认配置
    if (!tenantId) {
      this.cache.set(cacheKey, defaultConfig)
      return defaultConfig
    }

    // 加载租户配置
    const tenantConfig = await this.loadTenantConfig(tenantId)

    // 合并配置
    const mergedConfig = tenantConfig
      ? this.mergeConfig(defaultConfig, tenantConfig)
      : defaultConfig

    // 缓存结果
    this.cache.set(cacheKey, mergedConfig)

    return mergedConfig
  }

  /**
   * 深度合并配置
   */
  private mergeConfig(target: AppFullConfig, source: TenantConfig): AppFullConfig {
    const merged = this.deepMergeRecord(target, source)
    return parseAppFullConfig(merged, 'merged tenant config')
  }

  private deepMergeRecord(target: object, source: object): Record<string, unknown> {
    const result: Record<string, unknown> = Object.fromEntries(Object.entries(target))

    for (const [key, sourceValue] of Object.entries(source)) {
      const targetValue = result[key]
      if (isRecord(sourceValue) && isRecord(targetValue)) {
        result[key] = this.deepMergeRecord(targetValue, sourceValue)
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue
      }
    }

    return result
  }

  /**
   * 应用环境变量覆盖
   */
  private applyEnvironmentOverrides(config: AppFullConfig): AppFullConfig {
    const env = import.meta.env

    // 根据环境调整配置
    if (env['PROD']) {
      config.logger.level = config.logger.level ?? 'info'
      config.logger.showTimestamp = false
      // 演示项目：不覆盖 enableMock（允许生产环境使用 Mock 数据）
      config.config.logLevel = 'info'
    } else {
      config.logger.level = config.logger.level ?? 'debug'
      config.logger.showTimestamp = true
      config.config.enableMock = config.config.enableMock ?? true
      config.config.logLevel = 'debug'
    }

    // 支持环境变量覆盖 API 地址
    if (typeof env['VITE_API_BASE_URL'] === 'string' && env['VITE_API_BASE_URL'] !== '') {
      config.config.apiBaseUrl = env['VITE_API_BASE_URL']
      config.pageNode.apiBaseUrl = env['VITE_API_BASE_URL']
    }

    return config
  }

  /**
   * 获取最小可用配置（降级方案）
   */
  private getMinimalConfig(): AppFullConfig {
    return {
      router: { mode: 'history' },
      mountTarget: '#app',
      plugins: {
        'element-plus': true,
        'vxe-table': true
      },
      spark: { enabled: true },
      pageNode: {
        apiBaseUrl: '/api',
        homePath: '/home'
      },
      config: {
        apiBaseUrl: '/api',
        logLevel: 'debug',
        enableMock: true,  // 演示项目始终启用 Mock 数据
        version: '1.0.0',
        features: {
          enableExport: true,
          enableOffline: false
        }
      },
      logger: {
        level: import.meta.env['PROD'] ? 'info' : 'debug',
        enableColors: true,
        showTimestamp: !import.meta.env['PROD'],
        remoteEndpoint: '/api/logs'
      }
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
  }
}

/**
 * 租户识别器
 */
export class TenantResolver {
  /**
   * 从 URL 参数获取租户 ID
   */
  static fromQuery(): string | null {
    const params = new URLSearchParams(window.location.search)
    return params.get('tenant')
  }

  /**
   * 从子域名获取租户 ID
   * 例如：demo.example.com -> demo
   */
  static fromSubdomain(): string | null {
    const hostname = window.location.hostname
    const parts = hostname.split('.')

    // 如果是 localhost 或 IP，返回 null
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return null
    }

    // 如果有子域名，返回第一个部分
    if (parts.length > 2) {
      return parts[0] ?? null
    }

    return null
  }

  /**
   * 从 localStorage 获取租户 ID
   */
  static fromLocalStorage(): string | null {
    return localStorage.getItem('tenantId')
  }

  /**
   * 从 cookie 获取租户 ID
   */
  static fromCookie(): string | null {
    const match = document.cookie.match(/(?:^|;\s*)tenantId=([^;]+)/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }

  /**
   * 综合识别租户 ID（按优先级）
   * 优先级：URL 参数 > 子域名 > localStorage > cookie
   */
  static resolve(): string | null {
    return (
      this.fromQuery() ??
      this.fromSubdomain() ??
      this.fromLocalStorage() ??
      this.fromCookie()
    )
  }

  /**
   * 保存租户 ID 到 localStorage
   */
  static save(tenantId: string): void {
    localStorage.setItem('tenantId', tenantId)
  }
}

/**
 * 便捷函数：加载应用配置
 */
export async function loadAppConfig(): Promise<AppFullConfig> {
  // 识别租户
  const tenantId = TenantResolver.resolve()

  // 如果通过 URL 参数指定了租户，保存到 localStorage
  const queryTenant = TenantResolver.fromQuery()
  if (queryTenant) {
    TenantResolver.save(queryTenant)
  }

  // 加载配置
  const loader = ConfigLoader.getInstance()
  const config = await loader.loadConfig(tenantId ?? undefined)

  // 打印租户信息（调试用）
  if (config.tenant) {
    configLogger.info(`租户: ${config.tenant.tenantName} (${config.tenant.tenantId})`)
  } else {
    configLogger.info('租户: 默认配置')
  }

  return config
}
