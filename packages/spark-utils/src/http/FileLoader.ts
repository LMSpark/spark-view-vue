/**
 * FileLoader — HTTP 文件加载 + 自动计算结果缓存
 *
 * ## 基础用法（返回原始 JSON）
 * ```ts
 * const result = await loader.load<RuleConfig[]>('/page/rule.json')
 * ```
 *
 * ## 内联变换（一次性）
 * ```ts
 * const result = await loader.load<DataSet>('/pagedata.json', {
 *   transform: buildDataSet   // 变换结果自动缓存，下次命中跳过 buildDataSet
 * })
 * ```
 *
 * ## 预绑定变换（业务代码零感知）
 * ```ts
 * // 基础设施层：
 * const dataSetLoader = fileLoader.withTransform(buildDataSet)
 *
 * // 业务代码：
 * const ds = await dataSetLoader.load('/order-page/pagedata.json')
 * ```
 *
 * 缓存策略：所有结果（原始内容 & 变换产物）均以 sourceTimestamp 标记。
 * 源文件变更 → timestamp 变化 → 缓存自动失效 → 重新加载并计算。
 */

import { Logger } from '../logger'
import { toErrorMessage } from '../error-utils'
import { createRequest } from './Request'
import type { FileLoadOptions, CacheEntry, FileLoadResult, CacheExpirationTier, HttpClient } from './types'

const logger = Logger('FileLoader')

/** 默认过期策略级别定义 */
const DEFAULT_EXPIRATION_TIERS: CacheExpirationTier[] = [
  { level: 0, maxAge: Infinity, description: '永不过期' },
  { level: 1, maxAge: 3 * 24 * 60 * 60 * 1000, description: '3天' },
  { level: 2, maxAge: 7 * 24 * 60 * 60 * 1000, description: '7天' },
  { level: 3, maxAge: 15 * 24 * 60 * 60 * 1000, description: '15天' },
  { level: 4, maxAge: 30 * 24 * 60 * 60 * 1000, description: '30天' }
]

interface FileResponse {
  content: string
  timestamp: string
  notModified?: boolean
}

/** load() 选项 */
export interface LoadOptions<T = unknown> {
  /** false = 返回原始字符串，不 JSON.parse（默认 true） */
  parseJSON?: boolean
  /** 跳过缓存强制重新请求（默认 false） */
  forceRefresh?: boolean
  /**
   * 对原始文件内容应用变换，结果自动缓存（缓存键=文件路径）。
   * 提供后 load() 返回 T（变换结果），而非原始 JSON。
   */
  transform?: (rawContent: string) => T | Promise<T>
  /** 过期级别（覆盖全局默认值），对应 expirationTiers 中的 level */
  expirationLevel?: number
}

/** withTransform() 返回的子加载器接口 */
export interface DerivedLoader<T> {
  load(fileName: string, opts?: Pick<LoadOptions<T>, 'forceRefresh'>): Promise<FileLoadResult<T>>
  loadBatch(fileNames: string[], opts?: Pick<LoadOptions<T>, 'forceRefresh'>): Promise<Map<string, FileLoadResult<T>>>
}

export class FileLoader {
  private opts: Required<Omit<FileLoadOptions, 'getHeaders'>> & Pick<FileLoadOptions, 'getHeaders'>
  private memCache = new Map<string, CacheEntry<unknown>>()
  private request: HttpClient
  private storage: Storage | null

  constructor(options: FileLoadOptions) {
    this.opts = {
      storage: 'localStorage',
      cachePrefix: 'spark_file_',
      timeout: 10000,
      headers: {},
      fallbackToCache: true,
      expirationTiers: DEFAULT_EXPIRATION_TIERS,
      defaultExpirationLevel: 3,  // 默认15天
      maxCacheSize: 100,
      ...options
    }
    this.request = createRequest({
      baseURL: this.opts.baseUrl,
      timeout: this.opts.timeout,
      headers: this.opts.headers
    })
    // 动态 headers 回调：每次请求前注入（如 auth tenant headers）
    if (options.getHeaders) {
      const getHeaders = options.getHeaders
      this.request.interceptors.request.use({
        onRequest: (config) => {
          const dynamicHeaders = getHeaders()
          config.headers = { ...config.headers, ...dynamicHeaders }
          return config
        }
      })
    }
    this.storage = this.opts.storage === 'localStorage' 
      ? localStorage 
      : this.opts.storage === 'sessionStorage' 
        ? sessionStorage 
        : null

    // 启动时清理一次过期缓存
    this.cleanupExpiredCache()
  }

  /** 获取指定级别的过期时间（毫秒） */
  private getMaxAgeForLevel(level: number): number {
    const tier = this.opts.expirationTiers.find(t => t.level === level)
    return tier?.maxAge ?? this.opts.expirationTiers.find(t => t.level === this.opts.defaultExpirationLevel)?.maxAge ?? Infinity
  }

  // ==================== HTTP 文件加载 ====================

  /**
   * 加载单个文件。
   * - 不传 transform：返回解析后的原始 JSON（或字符串）。
   * - 传入 transform：返回变换结果，变换产物自动缓存，timestamp 未变时跳过变换。
   */
  async load<T = unknown>(
    fileName: string,
    options?: LoadOptions<T>
  ): Promise<FileLoadResult<T>> {
    const parseJSON = options?.parseJSON ?? true
    const forceRefresh = options?.forceRefresh ?? false
    const transform = options?.transform
    const expirationLevel = options?.expirationLevel ?? this.opts.defaultExpirationLevel

    // --- 1. 有 transform：两阶段缓存（防止 DataSet 等不可序列化对象经 JSON 往返后丢失原型方法） ---
    // rawKey:   存原始文件字符串 → localStorage（可序列化）
    // xformKey: 存 transform 结果 → 仅 memCache（DataSet 实例等，刷新后由 rawKey 重算）
    if (transform) {
      const rawKey   = `${fileName  }:raw`
      const xformKey = `${fileName  }:transform`

      // 同时读两层缓存
      const xformEntry = forceRefresh ? null : this.readEntryMem<T>(xformKey)
      const rawEntry   = forceRefresh ? null : this.readEntry<string>(rawKey)
      // timestamp 优先用 raw（与 localStorage 同源），次用 xform
      const knownTimestamp = rawEntry?.sourceTimestamp ?? xformEntry?.sourceTimestamp ?? ''

      try {
        const params = FileLoader.timestampParams(knownTimestamp)

        const response = await this.request.requestFull<FileResponse>({
          url: fileName,
          method: 'GET',
          params
        })
        const result = response.data

        if (result.notModified === true) {
          // 路径 1：内存命中 → 直接返回 DataSet 实例（最快）
          if (xformEntry) {
            return { success: true, data: xformEntry.data, timestamp: xformEntry.sourceTimestamp, fromCache: true, notModified: true }
          }
          // 路径 2：内存冷（页面刷新）+ localStorage raw 命中 → 重执行 transform，恢复原型
          // 守卫：rawEntry.data 必须是字符串（旧版可能错误存入对象）
          if (rawEntry && typeof rawEntry.data === 'string') {
            const transformed = await transform(rawEntry.data)
            this.writeEntryMem(xformKey, transformed, rawEntry.sourceTimestamp, expirationLevel)
            return { success: true, data: transformed, timestamp: rawEntry.sourceTimestamp, fromCache: true, notModified: true }
          }
          return { success: false, error: 'notModified 但无本地缓存', fromCache: false }
        }

        // 文件不存在或响应体为空（如可选的 style.css）——静默返回
        if (!result.content || !result.timestamp) {
          return { success: false, error: '响应格式错误：缺少 content 或 timestamp', fromCache: false }
        }

        // 新内容：raw 存 localStorage，transform 结果仅存内存
        const transformed = await transform(result.content)
        this.store(rawKey, result.content, result.timestamp, expirationLevel)
        this.writeEntryMem(xformKey, transformed, result.timestamp, expirationLevel)
        return { success: true, data: transformed, timestamp: result.timestamp, fromCache: false }

      } catch (error) {
        // 网络失败降级：优先内存 transform 结果，再尝试从 raw 重算
        if (this.opts.fallbackToCache) {
          if (xformEntry) {
            const msg = toErrorMessage(error)
            logger.warn('网络失败，使用 transform 缓存', { fileName, error: msg })
            return { success: true, data: xformEntry.data, timestamp: xformEntry.sourceTimestamp, fromCache: true, error: `降级缓存（${msg}）` }
          }
          if (rawEntry && typeof rawEntry.data === 'string') {
            try {
              const transformed = await transform(rawEntry.data)
              this.writeEntryMem(xformKey, transformed, rawEntry.sourceTimestamp, expirationLevel)
              const msg = toErrorMessage(error)
              logger.warn('网络失败，从 raw 缓存重执行 transform', { fileName, error: msg })
              return { success: true, data: transformed, timestamp: rawEntry.sourceTimestamp, fromCache: true, error: `降级缓存（${msg}）` }
            } catch { /* transform 失败，继续抛原始网络错误 */ }
          }
        }
        const msg = toErrorMessage(error)
        // 404 是可选文件（如 style.css）的正常情况，降级为 debug 避免控制台红色错误
        const status = (error as { status?: number }).status
        if (status === 404) {
          logger.debug('文件不存在（可选）', { fileName, status })
        } else {
          // 同时传入原始 error 对象，使浏览器控制台能展展完整 stack trace
          logger.error('文件加载或 transform 失败', { fileName, error: msg }, error)
        }
        return { success: false, error: msg, fromCache: false }
      }
    }

    // --- 2. 无 transform：缓存原始文件（保持原有逻辑） ---
    const rawResult = await this.loadRaw(fileName, forceRefresh, expirationLevel)
    if (!rawResult.success) return rawResult as FileLoadResult<T>

    const rawContent = rawResult.data ?? ''
    const timestamp = rawResult.timestamp ?? ''

    try {
      const data = parseJSON ? (JSON.parse(rawContent) as T) : (rawContent as T)
      return { success: true, data, timestamp, fromCache: rawResult.fromCache, ...(rawResult.notModified !== undefined && { notModified: rawResult.notModified }), ...(rawResult.error !== undefined && { error: rawResult.error }) }
    } catch (e) {
      return { success: false, error: `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`, fromCache: false }
    }
  }

  /** 批量加载（并行） */
  async loadBatch<T = unknown>(
    fileNames: string[],
    options?: LoadOptions<T>
  ): Promise<Map<string, FileLoadResult<T>>> {
    const results = new Map<string, FileLoadResult<T>>()
    await Promise.all(
      fileNames.map(async (f) => { results.set(f, await this.load<T>(f, options)) })
    )
    return results
  }

  /**
   * 预绑定变换函数，返回业务代码直接使用的子加载器。
   *
   * ```ts
   * // 基础设施层（一次）：
   * const dataSetLoader = fileLoader.withTransform(buildDataSet)
   *
   * // 业务代码（任意多处）：
   * const ds = await dataSetLoader.load('/order-page/pagedata.json')
   * ```
   */
  withTransform<T>(
    transform: (rawContent: string) => T | Promise<T>
  ): DerivedLoader<T> {
    return {
      load: (fileName, opts) =>
        this.load<T>(fileName, { ...opts, transform }),
      loadBatch: (fileNames, opts) =>
        this.loadBatch<T>(fileNames, { ...opts, transform })
    }
  }

  // ==================== 底层缓存操作（供高级使用） ====================

  /**
   * 手动缓存任意计算结果。
   * 通常不需要在业务代码中调用；优先使用 withTransform() 或 load({ transform })。
   */
  store<T>(key: string, data: T, sourceTimestamp: string, expirationLevel?: number): void {
    this.writeEntry<T>(key, data, sourceTimestamp, expirationLevel ?? this.opts.defaultExpirationLevel)
  }

  /**
   * 取回计算结果缓存，时间戳不匹配返回 null。
   * 通常不需要在业务代码中调用；优先使用 withTransform() 或 load({ transform })。
   */
  retrieve<T>(key: string, sourceTimestamp: string): T | null {
    const entry = this.readEntry<T>(key)
    if (entry?.sourceTimestamp !== sourceTimestamp) return null
    return entry.data
  }

  // ==================== 缓存管理 ====================

  /** 清除缓存（不传 key 则清全部） */
  clearCache(key?: string): void {
    if (key) {
      const k = this.opts.cachePrefix + key
      this.memCache.delete(k)
      this.storageRemove(k)
      // 同时清理 transform 路径产生的派生键（:raw 存 localStorage，:transform 存内存）
      const rawK   = `${this.opts.cachePrefix + key  }:raw`
      const xformK = `${this.opts.cachePrefix + key  }:transform`
      this.memCache.delete(rawK)
      this.storageRemove(rawK)
      this.memCache.delete(xformK)
    } else {
      this.memCache.clear()
      this.storageClearPrefix()
    }
  }

  /** 检查是否有缓存 */
  hasCache(key: string): boolean {
    return this.readEntry(key) !== null
  }

  /** 获取内存缓存统计信息 */
  getCacheStats(): { size: number; keys: string[] } {
    const prefix = this.opts.cachePrefix
    const keys = Array.from(this.memCache.keys()).map(k =>
      k.startsWith(prefix) ? k.slice(prefix.length) : k
    )
    return { size: this.memCache.size, keys }
  }

  /** 获取缓存的 sourceTimestamp（不存在则返回 null） */
  getTimestamp(key: string): string | null {
    return this.readEntry(key)?.sourceTimestamp ?? null
  }

  /** @deprecated 请使用 getTimestamp() */
  getCachedTimestamp(key: string): string | null {
    return this.getTimestamp(key)
  }

  // ==================== 内部实现 ====================

  /** 将已知 timestamp 包装为 params 对象，缺失时返回空对象 */
  private static timestampParams(knownTimestamp: string): Record<string, unknown> {
    return knownTimestamp ? { timestamp: knownTimestamp } : {}
  }

  /** 加载原始文件内容（仅维护 string 缓存，不做 JSON.parse 或 transform） */
  private async loadRaw(fileName: string, forceRefresh: boolean, expirationLevel?: number): Promise<FileLoadResult<string>> {
    try {
      const cached = forceRefresh ? null : this.readEntry<string>(fileName)
      const knownTimestamp = cached?.sourceTimestamp ?? ''

      const params = FileLoader.timestampParams(knownTimestamp)

      const response = await this.request.requestFull<FileResponse>({
        url: fileName,
        method: 'GET',
        params
      })
      const result = response.data

      if (result.notModified === true) {
        if (cached) {
          return { success: true, data: cached.data, timestamp: cached.sourceTimestamp, fromCache: true, notModified: true }
        }
        return { success: false, error: 'notModified 但无本地缓存', fromCache: false }
      }

      if (!result.content || !result.timestamp) {
        // 文件不存在或响应体为空（如可选的 style.css）——静默返回，不抛异常避免 logger.error
        return { success: false, error: '响应格式错误：缺少 content 或 timestamp', fromCache: false }
      }

      this.writeEntry<string>(fileName, result.content, result.timestamp, expirationLevel ?? this.opts.defaultExpirationLevel)
      return { success: true, data: result.content, timestamp: result.timestamp, fromCache: false }

    } catch (error) {
      if (this.opts.fallbackToCache) {
        const cached = this.readEntry<string>(fileName)
        if (cached) {
          const msg = toErrorMessage(error)
          logger.warn('网络失败，使用缓存', { fileName, error: msg })
          return { success: true, data: cached.data, timestamp: cached.sourceTimestamp, fromCache: true, error: `降级缓存（${msg}）` }
        }
      }
      return { success: false, error: toErrorMessage(error), fromCache: false }
    }
  }

  private readEntry<T>(key: string): CacheEntry<T> | null {
    const k = this.opts.cachePrefix + key
    let entry: CacheEntry<T> | null = null

    if (this.opts.storage === 'memory') {
      const cached = this.memCache.get(k) as CacheEntry<T> | undefined
      entry = cached ?? null
    } else {
      try {
        const raw = this.storage?.getItem(k)
        entry = raw ? (JSON.parse(raw) as CacheEntry<T>) : null
      } catch {
        // 损坏的缓存项：清理后返回 null，避免反复 parse 失败
        try { this.storage?.removeItem(k) } catch { /* ignore removeItem failure */ }
        return null
      }
    }

    if (!entry) return null

    // 滑动过期：基于 expirationLevel 检查闲置时间
    const now = Date.now()
    const idleTime = now - (entry.lastAccess || entry.cachedAt || 0)
    const maxAge = this.getMaxAgeForLevel(entry.expirationLevel)
    
    if (maxAge !== Infinity && idleTime > maxAge) {
      const tier = this.opts.expirationTiers.find(t => t.level === entry.expirationLevel)
      logger.debug('缓存闲置过期，自动删除', { 
        key, 
        level: entry.expirationLevel,
        tierDesc: tier?.description,
        idleDays: Math.round(idleTime / 1000 / 60 / 60 / 24) 
      })
      this.clearCache(key)
      return null
    }

    // 更新最后访问时间（滑动窗口）
    entry.lastAccess = now
    this.writeEntryDirect(k, entry)

    return entry
  }

  private writeEntry<T>(key: string, data: T, sourceTimestamp: string, expirationLevel: number): void {
    const now = Date.now()
    const entry: CacheEntry<T> = { 
      data, 
      sourceTimestamp,
      cachedAt: now,
      lastAccess: now,
      expirationLevel
    }
    const k = this.opts.cachePrefix + key

    // 检查缓存数量限制，超限时执行 LRU 清理
    this.enforceMaxCacheSize()

    this.writeEntryDirect(k, entry)
  }

  /** 只读内存缓存，跳过 localStorage（适用于 DataSet 等不可序列化的 transform 结果） */
  private readEntryMem<T>(key: string): CacheEntry<T> | null {
    const k = this.opts.cachePrefix + key
    const cached = this.memCache.get(k) as CacheEntry<T> | undefined
    const entry = cached ?? null
    if (entry === null) return null

    const now = Date.now()
    const idleTime = now - (entry.lastAccess || entry.cachedAt || 0)
    const maxAge = this.getMaxAgeForLevel(entry.expirationLevel)
    if (maxAge !== Infinity && idleTime > maxAge) {
      this.memCache.delete(k)
      return null
    }

    entry.lastAccess = now
    this.memCache.set(k, entry as CacheEntry<unknown>)
    return entry
  }

  /** 只写内存缓存，跳过 localStorage（适用于 DataSet 等不可序列化的 transform 结果） */
  private writeEntryMem<T>(key: string, data: T, sourceTimestamp: string, expirationLevel: number): void {
    const k = this.opts.cachePrefix + key
    const now = Date.now()
    const entry: CacheEntry<T> = {
      data,
      sourceTimestamp,
      cachedAt: now,
      lastAccess: now,
      expirationLevel
    }
    this.enforceMaxCacheSize()
    this.memCache.set(k, entry as CacheEntry<unknown>)
  }

  /** 直接写入缓存（不检查限制，内部方法） */
  private writeEntryDirect<T>(key: string, entry: CacheEntry<T>): void {
    if (this.opts.storage === 'memory') { 
      this.memCache.set(key, entry as CacheEntry<unknown>)
      return 
    }
    try { 
      this.storage?.setItem(key, JSON.stringify(entry)) 
    } catch (e) { 
      logger.error('缓存写入失败', { key, error: e }) 
    }
  }

  private storageRemove(key: string): void {
    if (this.opts.storage !== 'memory') {
      try { this.storage?.removeItem(key) } catch (e) { logger.debug('缓存移除失败', { key, error: e }) }
    }
  }

  /** 清理过期缓存（基于分级过期策略） */
  private cleanupExpiredCache(): void {
    const now = Date.now()
    const prefix = this.opts.cachePrefix
    let cleaned = 0

    if (this.opts.storage === 'memory') {
      for (const [key, entry] of this.memCache.entries()) {
        if (!key.startsWith(prefix)) continue
        const idleTime = now - (entry.lastAccess || entry.cachedAt || 0)
        const maxAge = this.getMaxAgeForLevel(entry.expirationLevel)
        if (maxAge !== Infinity && idleTime > maxAge) {
          this.memCache.delete(key)
          cleaned++
        }
      }
    } else {
      const storage = this.storage
      if (!storage) return
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i)
        if (!key?.startsWith(prefix)) continue
        try {
          const raw = storage.getItem(key)
          if (!raw) continue
          const entry = JSON.parse(raw) as CacheEntry<unknown>
          const idleTime = now - (entry.lastAccess || entry.cachedAt || 0)
          const maxAge = this.getMaxAgeForLevel(entry.expirationLevel)
          if (maxAge !== Infinity && idleTime > maxAge) {
            storage.removeItem(key)
            cleaned++
          }
        } catch { /* 损坏的缓存直接删除 */ storage.removeItem(key) }
      }
    }

    if (cleaned > 0) {
      logger.info('清理闲置缓存完成', { cleaned, defaultLevel: this.opts.defaultExpirationLevel })
    }
  }

  /** 强制执行缓存数量限制（LRU 策略） */
  private enforceMaxCacheSize(): void {
    const prefix = this.opts.cachePrefix
    const entries: Array<{ key: string; lastAccess: number }> = []

    if (this.opts.storage === 'memory') {
      for (const [key, entry] of this.memCache.entries()) {
        if (key.startsWith(prefix)) {
          entries.push({ key, lastAccess: entry.lastAccess || 0 })
        }
      }
    } else {
      const storage = this.storage
      if (!storage) return
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (!key?.startsWith(prefix)) continue
        try {
          const raw = storage.getItem(key)
          if (!raw) continue
          const entry = JSON.parse(raw) as CacheEntry<unknown>
          entries.push({ key, lastAccess: entry.lastAccess || 0 })
        } catch { /* ignore */ }
      }
    }

    // 如果超出限制，删除最旧的项
    const excess = entries.length - this.opts.maxCacheSize
    if (excess > 0) {
      entries.sort((a, b) => a.lastAccess - b.lastAccess)
      const toRemove = entries.slice(0, excess)
      for (const item of toRemove) {
        if (this.opts.storage === 'memory') {
          this.memCache.delete(item.key)
        } else {
          this.storage?.removeItem(item.key)
        }
      }
      logger.info('LRU 清理缓存', { removed: toRemove.length, totalEntries: entries.length })
    }
  }

  private storageClearPrefix(): void {
    if (this.opts.storage === 'memory') return
    const s = this.storage
    if (!s) return
    for (const k of Object.keys(s)) {
      if (k.startsWith(this.opts.cachePrefix)) s.removeItem(k)
    }
  }
}

export function createFileLoader(options: FileLoadOptions): FileLoader {
  return new FileLoader(options)
}
