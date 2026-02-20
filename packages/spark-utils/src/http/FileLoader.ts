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
import { Request } from './Request'
import type { FileLoadOptions, CacheEntry, FileLoadResult } from './types'

const logger = Logger('FileLoader')

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
   * 对原始文件内容应用变换，结果自动缓存。
   * 提供后 load() 返回 T（变换结果），而非原始 JSON。
   */
  transform?: (rawContent: string) => T | Promise<T>
  /**
   * 变换结果的缓存键后缀。
   * 默认取 transform.name；匿名函数时用 'derived'。
   */
  transformKey?: string
}

/** withTransform() 返回的子加载器接口 */
export interface DerivedLoader<T> {
  load(fileName: string, opts?: Pick<LoadOptions<T>, 'forceRefresh'>): Promise<FileLoadResult<T>>
  loadBatch(fileNames: string[], opts?: Pick<LoadOptions<T>, 'forceRefresh'>): Promise<Map<string, FileLoadResult<T>>>
}

export class FileLoader {
  private opts: Required<FileLoadOptions>
  private memCache = new Map<string, CacheEntry<unknown>>()
  private request: Request

  constructor(options: FileLoadOptions) {
    this.opts = {
      storage: 'localStorage',
      cachePrefix: 'spark_file_',
      timeout: 10000,
      headers: {},
      fallbackToCache: true,
      ...options
    }
    this.request = new Request({
      baseURL: this.opts.baseUrl,
      timeout: this.opts.timeout,
      headers: this.opts.headers
    })
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

    // --- 1. 获取原始文件（带时间戳缓存） ---
    const rawResult = await this.loadRaw(fileName, forceRefresh)
    if (!rawResult.success) return rawResult as FileLoadResult<T>

    const rawContent = rawResult.data ?? ''
    const timestamp = rawResult.timestamp ?? ''

    // --- 2. 如有 transform：检查变换结果缓存 ---
    if (transform) {
      const suffix = options?.transformKey ?? (transform.name || 'derived')
      const derivedKey = `${fileName}:${suffix}`

      if (!forceRefresh) {
        const cached = this.retrieve<T>(derivedKey, timestamp)
        if (cached !== null) {
          return { success: true, data: cached, timestamp, fromCache: true, ...(rawResult.notModified !== undefined && { notModified: rawResult.notModified }) }
        }
      }

      try {
        const transformed = await transform(rawContent)
        this.store(derivedKey, transformed, timestamp)
        return { success: true, data: transformed, timestamp, fromCache: false, ...(rawResult.error !== undefined && { error: rawResult.error }) }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger.error('transform 执行失败', { fileName, error: msg })
        return { success: false, error: `transform 失败: ${msg}`, fromCache: false }
      }
    }

    // --- 3. 无 transform：直接解析原始内容 ---
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
    transform: (rawContent: string) => T | Promise<T>,
    transformKey?: string
  ): DerivedLoader<T> {
    return {
      load: (fileName, opts) =>
        this.load<T>(fileName, { ...opts, transform, ...(transformKey !== undefined && { transformKey }) }),
      loadBatch: (fileNames, opts) =>
        this.loadBatch<T>(fileNames, { ...opts, transform, ...(transformKey !== undefined && { transformKey }) })
    }
  }

  // ==================== 底层缓存操作（供高级使用） ====================

  /**
   * 手动缓存任意计算结果。
   * 通常不需要在业务代码中调用；优先使用 withTransform() 或 load({ transform })。
   */
  store<T>(key: string, data: T, sourceTimestamp: string): void {
    this.writeEntry<T>(key, data, sourceTimestamp)
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
    } else {
      this.memCache.clear()
      this.storageClearPrefix()
    }
  }

  /** 检查是否有缓存 */
  hasCache(key: string): boolean {
    return this.readEntry(key) !== null
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

  /** 加载原始文件内容（仅维护 string 缓存，不做 JSON.parse 或 transform） */
  private async loadRaw(fileName: string, forceRefresh: boolean): Promise<FileLoadResult<string>> {
    try {
      const cached = forceRefresh ? null : this.readEntry<string>(fileName)
      const knownTimestamp = cached?.sourceTimestamp ?? ''

      const params: Record<string, unknown> = {}
      if (knownTimestamp) params['timestamp'] = knownTimestamp

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
        throw new Error('响应格式错误：缺少 content 或 timestamp')
      }

      this.writeEntry<string>(fileName, result.content, result.timestamp)
      return { success: true, data: result.content, timestamp: result.timestamp, fromCache: false }

    } catch (error) {
      if (this.opts.fallbackToCache) {
        const cached = this.readEntry<string>(fileName)
        if (cached) {
          const msg = error instanceof Error ? error.message : String(error)
          logger.warn('网络失败，使用缓存', { fileName, error: msg })
          return { success: true, data: cached.data, timestamp: cached.sourceTimestamp, fromCache: true, error: `降级缓存（${msg}）` }
        }
      }
      return { success: false, error: error instanceof Error ? error.message : String(error), fromCache: false }
    }
  }

  private readEntry<T>(key: string): CacheEntry<T> | null {
    const k = this.opts.cachePrefix + key
    if (this.opts.storage === 'memory') return (this.memCache.get(k) as CacheEntry<T>) ?? null
    try {
      const raw = this.storage.getItem(k)
      return raw ? (JSON.parse(raw) as CacheEntry<T>) : null
    } catch { return null }
  }

  private writeEntry<T>(key: string, data: T, sourceTimestamp: string): void {
    const entry: CacheEntry<T> = { data, sourceTimestamp }
    const k = this.opts.cachePrefix + key
    if (this.opts.storage === 'memory') { this.memCache.set(k, entry as CacheEntry<unknown>); return }
    try { this.storage.setItem(k, JSON.stringify(entry)) }
    catch (e) { logger.error('缓存写入失败', { key: k, error: e }) }
  }

  private get storage(): Storage {
    return this.opts.storage === 'sessionStorage' ? sessionStorage : localStorage
  }

  private storageRemove(key: string): void {
    if (this.opts.storage !== 'memory') {
      try { this.storage.removeItem(key) } catch { /* ignore */ }
    }
  }

  private storageClearPrefix(): void {
    if (this.opts.storage === 'memory') return
    const s = this.storage
    Object.keys(s).filter(k => k.startsWith(this.opts.cachePrefix)).forEach(k => s.removeItem(k))
  }
}

export function createFileLoader(options: FileLoadOptions): FileLoader {
  return new FileLoader(options)
}
