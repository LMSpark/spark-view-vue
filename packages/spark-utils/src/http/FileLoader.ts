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
 *   transform: buildDataSet
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
import { isRecord, readNumberProperty } from '../internal/guards.js'
import { createRequest } from './Request'
import type {
  FileLoadOptions,
  CacheEntry,
  FileLoadResult,
  CacheExpirationTier,
  HttpClient,
  FileLoaderEventMap,
} from './types'

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
  content?: string
  timestamp?: string
  notModified?: boolean
}

interface CacheWriteOptions {
  recoverQuota?: boolean
  reportFailureAsError?: boolean
}

type FileLoaderListeners = {
  [K in keyof FileLoaderEventMap]: Array<(payload: FileLoaderEventMap[K]) => void>
}

interface LoadOptionBase {
  /** false = 返回原始字符串，不 JSON.parse（默认 true） */
  /** 跳过缓存强制重新请求（默认 false） */
  forceRefresh?: boolean
  /** 过期级别（覆盖全局默认值），对应 expirationTiers 中的 level */
  expirationLevel?: number
}

export type JsonLoadOptions = LoadOptionBase & {
  parseJSON?: true
}

export type TextLoadOptions = LoadOptionBase & {
  parseJSON: false
}

export type TransformLoadOptions<T> = LoadOptionBase & {
  /**
   * 对原始文件内容应用变换，结果自动缓存（缓存键=文件路径）。
   * 提供后 load() 返回 T（变换结果），而非原始 JSON。
   */
  transform: (rawContent: string) => T | Promise<T>
}

/** load() 选项 */
export type LoadOptions<T = unknown> = JsonLoadOptions | TextLoadOptions | TransformLoadOptions<T>

export type TransformedFileLoadOptions = Pick<LoadOptionBase, 'forceRefresh'>

export class TransformedFileLoader<T> {
  private readonly transformedCache = new Map<string, CacheEntry<T>>()

  constructor(
    private readonly owner: FileLoader,
    private readonly transform: (rawContent: string) => T | Promise<T>,
  ) {}

  load(fileName: string, opts?: TransformedFileLoadOptions): Promise<FileLoadResult<T>> {
    return this.loadTransformed(fileName, opts)
  }

  async loadBatch(fileNames: string[], opts?: TransformedFileLoadOptions): Promise<Map<string, FileLoadResult<T>>> {
    const results = new Map<string, FileLoadResult<T>>()
    await Promise.all(
      fileNames.map(async (fileName) => {
        results.set(fileName, await this.load(fileName, opts))
      }),
    )
    return results
  }

  private async loadTransformed(fileName: string, opts?: TransformedFileLoadOptions): Promise<FileLoadResult<T>> {
    const cached = opts?.forceRefresh === true ? null : this.readTransformedEntry(fileName)
    const raw = await this.owner.loadText(fileName, opts)
    if (!raw.success) return this.failureFrom(raw)

    if (raw.notModified === true && cached !== null && cached.sourceTimestamp === raw.timestamp) {
      return {
        success: true,
        data: cached.data,
        timestamp: cached.sourceTimestamp,
        fromCache: true,
        notModified: true,
      }
    }

    let data: T
    try {
      data = await this.transform(raw.data ?? '')
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
        fromCache: false,
        reason: 'parse',
      }
    }
    const timestamp = raw.timestamp ?? ''
    if (timestamp !== '') {
      this.transformedCache.set(fileName, {
        data,
        sourceTimestamp: timestamp,
        cachedAt: Date.now(),
        lastAccess: Date.now(),
        expirationLevel: 0,
      })
    }
    return {
      success: true,
      data,
      timestamp,
      fromCache: raw.fromCache,
      ...(raw.notModified !== undefined && { notModified: raw.notModified }),
      ...(raw.error !== undefined && { error: raw.error }),
    }
  }

  private readTransformedEntry(fileName: string): CacheEntry<T> | null {
    const entry = this.transformedCache.get(fileName) ?? null
    if (entry === null) return null
    entry.lastAccess = Date.now()
    return entry
  }

  private failureFrom(result: FileLoadResult<unknown>): FileLoadResult<never> {
    return {
      success: false,
      fromCache: result.fromCache,
      ...(result.error !== undefined && { error: result.error }),
      ...(result.timestamp !== undefined && { timestamp: result.timestamp }),
      ...(result.notModified !== undefined && { notModified: result.notModified }),
      ...(result.status !== undefined && { status: result.status }),
      ...(result.reason !== undefined && { reason: result.reason }),
    }
  }
}

export class FileLoader {
  private opts: Required<Omit<FileLoadOptions, 'getHeaders'>> & Pick<FileLoadOptions, 'getHeaders'>
  private memCache = new Map<string, CacheEntry<unknown>>()
  private request: HttpClient
  private storage: Storage | null
  private listeners: FileLoaderListeners = {
    'file-loaded': [],
    'file-missing': [],
    'file-error': [],
  }

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

  /** 订阅 FileLoader 事件（file-loaded / file-missing / file-error） */
  on<K extends keyof FileLoaderEventMap>(
    event: K,
    listener: (payload: FileLoaderEventMap[K]) => void,
  ): () => void {
    this.listeners[event].push(listener)
    return () => this.removeListener(event, listener)
  }

  private removeListener<K extends keyof FileLoaderEventMap>(
    event: K,
    listener: (payload: FileLoaderEventMap[K]) => void,
  ): void {
    const bucket = this.listeners[event]
    const idx = bucket.indexOf(listener)
    if (idx >= 0) bucket.splice(idx, 1)
  }

  private emit(event: 'file-loaded', payload: FileLoaderEventMap['file-loaded']): void
  private emit(event: 'file-missing', payload: FileLoaderEventMap['file-missing']): void
  private emit(event: 'file-error', payload: FileLoaderEventMap['file-error']): void
  private emit(event: keyof FileLoaderEventMap, payload: unknown): void {
    switch (event) {
      case 'file-loaded':
        if (!this.isFileLoadedPayload(payload)) throw new Error('Invalid file-loaded payload')
        this.notifyListeners(event, this.listeners['file-loaded'], payload)
        return
      case 'file-missing':
        if (!this.isFileMissingPayload(payload)) throw new Error('Invalid file-missing payload')
        this.notifyListeners(event, this.listeners['file-missing'], payload)
        return
      case 'file-error':
        if (!this.isFileErrorPayload(payload)) throw new Error('Invalid file-error payload')
        this.notifyListeners(event, this.listeners['file-error'], payload)
        return
    }
  }

  private notifyListeners<TPayload>(
    event: keyof FileLoaderEventMap,
    bucket: Array<(payload: TPayload) => void>,
    payload: TPayload,
  ): void {
    if (bucket.length === 0) return
    for (const listener of bucket) {
      try {
        listener(payload)
      } catch (err) {
        logger.warn('FileLoader 事件监听器执行失败', { event, error: toErrorMessage(err) })
      }
    }
  }

  private isFileLoadedPayload(value: unknown): value is FileLoaderEventMap['file-loaded'] {
    return isRecord(value)
      && typeof value['fileName'] === 'string'
      && typeof value['fromCache'] === 'boolean'
  }

  private isFileMissingPayload(value: unknown): value is FileLoaderEventMap['file-missing'] {
    return isRecord(value)
      && typeof value['fileName'] === 'string'
      && value['reason'] === 'not-found'
  }

  private isFileErrorPayload(value: unknown): value is FileLoaderEventMap['file-error'] {
    return isRecord(value)
      && typeof value['fileName'] === 'string'
      && typeof value['error'] === 'string'
      && (value['reason'] === 'network'
        || value['reason'] === 'invalid-response'
        || value['reason'] === 'parse'
        || value['reason'] === 'unknown')
  }

  loadText(fileName: string, options?: TransformedFileLoadOptions): Promise<FileLoadResult<string>> {
    const textOptions: TextLoadOptions = options?.forceRefresh === true
      ? { parseJSON: false, forceRefresh: true }
      : { parseJSON: false }
    return this.load(fileName, textOptions)
  }

  /**
   * 加载单个文件。
   * - 不传 transform：返回解析后的原始 JSON（或字符串）。
   * - 传入 transform：返回变换结果，变换产物自动缓存，timestamp 未变时跳过变换。
   */
  async load<T>(fileName: string, options: TransformLoadOptions<T>): Promise<FileLoadResult<T>>
  async load(fileName: string, options: TextLoadOptions): Promise<FileLoadResult<string>>
  async load(fileName: string, options?: JsonLoadOptions): Promise<FileLoadResult<unknown>>
  async load<T>(
    fileName: string,
    options?: LoadOptions<T>,
  ): Promise<FileLoadResult<T> | FileLoadResult<string> | FileLoadResult<unknown>> {
    const parseJSON = options !== undefined && 'parseJSON' in options ? options.parseJSON ?? true : true
    const forceRefresh = options?.forceRefresh ?? false
    const transform = options !== undefined && 'transform' in options ? options.transform : undefined
    const expirationLevel = options?.expirationLevel ?? this.opts.defaultExpirationLevel

    if (transform) return new TransformedFileLoader(this, transform).load(fileName, { forceRefresh })

    // --- 2. 无 transform：缓存原始文件（保持原有逻辑） ---
    const rawResult = await this.loadRaw(fileName, forceRefresh, expirationLevel)
    if (!rawResult.success) return this.fileLoadFailure(rawResult)

    const rawContent = rawResult.data ?? ''
    const timestamp = rawResult.timestamp ?? ''

    try {
      const data: unknown = parseJSON ? JSON.parse(rawContent) : rawContent
      return { success: true, data, timestamp, fromCache: rawResult.fromCache, ...(rawResult.notModified !== undefined && { notModified: rawResult.notModified }), ...(rawResult.error !== undefined && { error: rawResult.error }) }
    } catch (e) {
      const parseError = `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`
      this.emit('file-error', { fileName, error: parseError, reason: 'parse' })
      return { success: false, error: parseError, fromCache: false, reason: 'parse' }
    }
  }

  /** 批量加载（并行） */
  async loadBatch<T>(fileNames: string[], options: TransformLoadOptions<T>): Promise<Map<string, FileLoadResult<T>>>
  async loadBatch(fileNames: string[], options: TextLoadOptions): Promise<Map<string, FileLoadResult<string>>>
  async loadBatch(fileNames: string[], options?: JsonLoadOptions): Promise<Map<string, FileLoadResult<unknown>>>
  async loadBatch<T>(
    fileNames: string[],
    options?: LoadOptions<T>,
  ): Promise<Map<string, FileLoadResult<T> | FileLoadResult<string> | FileLoadResult<unknown>>> {
    const results = new Map<string, FileLoadResult<T> | FileLoadResult<string> | FileLoadResult<unknown>>()
    await Promise.all(
      fileNames.map(async (f) => {
        if (options !== undefined && 'transform' in options) {
          results.set(f, await this.load(f, options))
          return
        }
        if (options !== undefined && 'parseJSON' in options && options.parseJSON === false) {
          results.set(f, await this.load(f, options))
          return
        }
        results.set(f, await this.load(f, options))
      })
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
  ): TransformedFileLoader<T> {
    return new TransformedFileLoader(this, transform)
  }

  // ==================== 底层缓存操作（供高级使用） ====================

  /**
   * 手动缓存任意计算结果。
   * 通常不需要在业务代码中调用；优先使用 withTransform() 或 load({ transform })。
   */
  store(key: string, data: unknown, sourceTimestamp: string, expirationLevel?: number): void {
    this.writeEntry(key, data, sourceTimestamp, expirationLevel ?? this.opts.defaultExpirationLevel)
  }

  /**
   * 取回计算结果缓存，时间戳不匹配返回 null。
   * 通常不需要在业务代码中调用；优先使用 withTransform() 或 load({ transform })。
   */
  retrieve(key: string, sourceTimestamp: string): unknown {
    const entry = this.readEntry(key)
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
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    return { size: this.memCache.size, keys }
  }

  /** 获取缓存的 sourceTimestamp（不存在则返回 null） */
  getTimestamp(key: string): string | null {
    return this.readEntry(key)?.sourceTimestamp ?? null
  }

  // ==================== 内部实现 ====================

  /** 将已知 timestamp 包装为 params 对象，缺失时返回空对象 */
  private static timestampParams(knownTimestamp: string): Record<string, unknown> {
    return knownTimestamp ? { timestamp: knownTimestamp } : {}
  }

  /** 加载原始文件内容（仅维护 string 缓存，不做 JSON.parse 或 transform） */
  private async loadRaw(fileName: string, forceRefresh: boolean, expirationLevel?: number): Promise<FileLoadResult<string>> {
    try {
      const cached = forceRefresh ? null : this.readEntry(fileName)
      // 同上：这里的 timestamp 是后端文件版本戳，用于条件读取。
      // 如果随手改成 lastAccess/cachedAt，服务端会误判为变化并重复返回文件内容。
      const knownTimestamp = cached?.sourceTimestamp ?? ''

      const params = FileLoader.timestampParams(knownTimestamp)

      const response = await this.request.requestFull({
        url: fileName,
        method: 'GET',
        params,
        meta: {
          silentHttpErrorStatusCodes: [404],
        },
      })
      const result = response.data
      if (!this.isFileResponse(result)) {
        this.emit('file-error', { fileName, error: '响应格式错误：响应体不是文件响应对象', reason: 'invalid-response' })
        return { success: false, error: '响应格式错误：响应体不是文件响应对象', fromCache: false, reason: 'invalid-response' }
      }

      if (result.notModified === true) {
        if (cached && typeof cached.data === 'string') {
          this.emit('file-loaded', { fileName, fromCache: true, timestamp: cached.sourceTimestamp, notModified: true })
          return { success: true, data: cached.data, timestamp: cached.sourceTimestamp, fromCache: true, notModified: true }
        }
        this.emit('file-error', { fileName, error: 'notModified 但无本地缓存', reason: 'invalid-response' })
        return { success: false, error: 'notModified 但无本地缓存', fromCache: false, reason: 'invalid-response' }
      }

      if (typeof result.content !== 'string' || !result.timestamp) {
        // 文件不存在或响应体为空（如可选的 style.css）——静默返回，不抛异常避免 logger.error
        this.emit('file-error', { fileName, error: '响应格式错误：缺少 content 或 timestamp', reason: 'invalid-response' })
        return { success: false, error: '响应格式错误：缺少 content 或 timestamp', fromCache: false, reason: 'invalid-response' }
      }

      this.writeEntry(fileName, result.content, result.timestamp, expirationLevel ?? this.opts.defaultExpirationLevel)
      this.emit('file-loaded', { fileName, fromCache: false, timestamp: result.timestamp })
      return { success: true, data: result.content, timestamp: result.timestamp, fromCache: false }

    } catch (error) {
      if (this.opts.fallbackToCache) {
        const cached = this.readEntry(fileName)
        if (cached && typeof cached.data === 'string') {
          const msg = toErrorMessage(error)
          logger.warn('网络失败，使用缓存', { fileName, error: msg })
          this.emit('file-loaded', { fileName, fromCache: true, timestamp: cached.sourceTimestamp })
          return { success: true, data: cached.data, timestamp: cached.sourceTimestamp, fromCache: true, error: `降级缓存（${msg}）` }
        }
      }
      const msg = toErrorMessage(error)
      const status = readNumberProperty(error, 'status')
      if (status === 404) {
        this.emit('file-missing', { fileName, status, reason: 'not-found' })
      } else {
        this.emit('file-error', {
          fileName,
          ...(status !== undefined && { status }),
          error: msg,
          reason: status === 0 ? 'network' : 'unknown',
        })
      }
      return {
        success: false,
        error: msg,
        fromCache: false,
        ...(status !== undefined && { status }),
        reason: status === 404 ? 'not-found' : status === 0 ? 'network' : 'unknown',
      }
    }
  }

  private readEntry(key: string): CacheEntry<unknown> | null {
    const k = this.opts.cachePrefix + key
    let entry: CacheEntry<unknown> | null = null

    if (this.opts.storage === 'memory') {
      entry = this.memCache.get(k) ?? null
    } else {
      try {
        const raw = this.storage?.getItem(k)
        entry = raw ? this.parseCacheEntry(raw) : null
      } catch {
        // 损坏的缓存项：清理后返回 null，避免反复 parse 失败
        try { this.storage?.removeItem(k) } catch { /* ignore removeItem failure */ }
        return null
      }
    }

    if (!entry) return null

    // 滑动过期只看前端本地闲置时间。
    // sourceTimestamp 是后端源文件版本戳，只用于条件读取；不能拿来决定清缓存顺序。
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
    this.writeEntryDirect(k, entry, { recoverQuota: false, reportFailureAsError: false })

    return entry
  }

  private fileLoadFailure(result: FileLoadResult<unknown>): FileLoadResult<never> {
    return {
      success: false,
      fromCache: result.fromCache,
      ...(result.error !== undefined && { error: result.error }),
      ...(result.timestamp !== undefined && { timestamp: result.timestamp }),
      ...(result.notModified !== undefined && { notModified: result.notModified }),
      ...(result.status !== undefined && { status: result.status }),
      ...(result.reason !== undefined && { reason: result.reason }),
    }
  }

  private parseCacheEntry(raw: string): CacheEntry<unknown> | null {
    const parsed: unknown = JSON.parse(raw)
    return this.isCacheEntry(parsed) ? parsed : null
  }

  private isCacheEntry(value: unknown): value is CacheEntry<unknown> {
    return isRecord(value)
      && Object.prototype.hasOwnProperty.call(value, 'data')
      && typeof value['sourceTimestamp'] === 'string'
      && typeof value['cachedAt'] === 'number'
      && typeof value['lastAccess'] === 'number'
      && typeof value['expirationLevel'] === 'number'
  }

  private isFileResponse(value: unknown): value is FileResponse {
    if (!isRecord(value)) return false
    return (value['content'] === undefined || typeof value['content'] === 'string')
      && (value['timestamp'] === undefined || typeof value['timestamp'] === 'string')
      && (value['notModified'] === undefined || typeof value['notModified'] === 'boolean')
  }

  private writeEntry(key: string, data: unknown, sourceTimestamp: string, expirationLevel: number): void {
    const now = Date.now()
    const entry: CacheEntry<unknown> = {
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

  /** 直接写入缓存（不检查限制，内部方法） */
  private writeEntryDirect(key: string, entry: CacheEntry<unknown>, options: CacheWriteOptions = {}): void {
    if (this.opts.storage === 'memory') {
      this.memCache.set(key, entry)
      return
    }
    const storage = this.storage
    if (!storage) return

    const recoverQuota = options.recoverQuota ?? true
    const reportFailureAsError = options.reportFailureAsError ?? true
    const payload = JSON.stringify(entry)
    let attempt = 0

    while (attempt <= 20) {
      try {
        storage.setItem(key, payload)
        return
      } catch (e) {
        if (!this.isQuotaExceededError(e)) {
          this.reportCacheWriteFailure('缓存写入失败', { key, error: e }, reportFailureAsError)
          return
        }

        if (!recoverQuota) {
          logger.debug('缓存元数据写入因配额不足跳过', { key })
          return
        }

        if (attempt === 0) {
          // 先清理过期项（当前 prefix + 全局），避免无谓驱逐有效缓存。
          this.cleanupExpiredCache()
          this.cleanupExpiredCacheGlobal()
          attempt++
          continue
        }

        // 先尝试当前 prefix 内驱逐，失败则升级为跨租户全局驱逐
        let evictedKey = this.evictLeastRecentlyUsedStorageEntry(key)
        evictedKey ??= this.evictGlobalStorageEntry(key)
        if (!evictedKey) {
          logger.error('缓存写入失败（配额已满且无可驱逐项）', { key, error: e })
          return
        }

        logger.debug('缓存配额已满，驱逐最旧缓存后重试写入', {
          key,
          evictedKey,
          attempt,
        })
        attempt++
      }
    }

    logger.error('缓存写入失败（达到最大重试次数）', { key })
  }

  private reportCacheWriteFailure(message: string, details: Record<string, unknown>, asError: boolean): void {
    if (asError) {
      logger.error(message, details)
    } else {
      logger.debug(message, details)
    }
  }

  private isQuotaExceededError(error: unknown): boolean {
    if (error instanceof DOMException) {
      return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014
    }
    if (!isRecord(error)) return false
    return error['name'] === 'QuotaExceededError' || error['code'] === 22 || error['code'] === 1014
  }

  private evictLeastRecentlyUsedStorageEntry(protectedKey: string): string | null {
    if (this.opts.storage === 'memory') return null
    const storage = this.storage
    if (!storage) return null

    const prefix = this.opts.cachePrefix
    // 配额不足时按本地 LRU 驱逐。
    // 页面四文件的 sourceTimestamp 可能很旧但仍被频繁访问，不能因此优先清掉。
    const entries: Array<{ key: string; lastAccess: number }> = []

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(prefix) || key === protectedKey) continue
      try {
        const raw = storage.getItem(key)
        if (!raw) continue
        const entry = this.parseCacheEntry(raw)
        if (entry === null) {
          entries.push({ key, lastAccess: 0 })
          continue
        }
        entries.push({ key, lastAccess: entry.lastAccess || entry.cachedAt || 0 })
      } catch {
        entries.push({ key, lastAccess: 0 })
      }
    }

    if (entries.length === 0) return null

    entries.sort((a, b) => a.lastAccess - b.lastAccess)
    const target = entries[0]
    if (!target) return null
    try {
      storage.removeItem(target.key)
      return target.key
    } catch {
      return null
    }
  }

  /** 跨租户全局驱逐：当当前 prefix 下无可驱逐项时，从所有 spark_page_ 缓存中按本地 LRU 驱逐 */
  private evictGlobalStorageEntry(protectedKey: string): string | null {
    if (this.opts.storage === 'memory') return null
    const storage = this.storage
    if (!storage) return null

    const globalPrefix = 'spark_page_'
    // 这里同样是 lastAccess/cachedAt 顺序，不是 sourceTimestamp 顺序。
    // sourceTimestamp 排序属于“文件版本展示”，不属于“前端空间回收”。
    const entries: Array<{ key: string; lastAccess: number }> = []

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(globalPrefix) || key === protectedKey) continue
      try {
        const raw = storage.getItem(key)
        if (!raw) continue
        const entry = this.parseCacheEntry(raw)
        if (entry === null) {
          entries.push({ key, lastAccess: 0 })
          continue
        }
        entries.push({ key, lastAccess: entry.lastAccess || entry.cachedAt || 0 })
      } catch {
        entries.push({ key, lastAccess: 0 })
      }
    }

    if (entries.length === 0) return null

    entries.sort((a, b) => a.lastAccess - b.lastAccess)
    const target = entries[0]
    if (!target) return null
    try {
      storage.removeItem(target.key)
      return target.key
    } catch {
      return null
    }
  }

  /** 跨租户全局过期清理：清理所有 spark_page_ 前缀下的闲置过期缓存 */
  private cleanupExpiredCacheGlobal(): void {
    const storage = this.storage
    if (!storage) return
    const now = Date.now()
    const globalPrefix = 'spark_page_'
    let cleaned = 0

    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i)
      if (!key?.startsWith(globalPrefix)) continue
      try {
        const raw = storage.getItem(key)
        if (!raw) continue
        const entry = this.parseCacheEntry(raw)
        if (entry === null) {
          storage.removeItem(key)
          cleaned++
          continue
        }
        const idleTime = now - (entry.lastAccess || entry.cachedAt || 0)
        const maxAge = this.getMaxAgeForLevel(entry.expirationLevel)
        if (maxAge !== Infinity && idleTime > maxAge) {
          storage.removeItem(key)
          cleaned++
        }
      } catch {
        storage.removeItem(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      logger.info('全局清理闲置缓存完成', { cleaned })
    }
  }

  private storageRemove(key: string): void {
    if (this.opts.storage !== 'memory') {
      try { this.storage?.removeItem(key) } catch (e) { logger.debug('缓存移除失败', { key, error: e }) }
    }
  }

  /** 清理过期缓存（基于前端闲置时间 + 分级过期策略） */
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
          const entry = this.parseCacheEntry(raw)
          if (entry === null) {
            storage.removeItem(key)
            cleaned++
            continue
          }
          const idleTime = now - (entry.lastAccess || entry.cachedAt || 0)
          const maxAge = this.getMaxAgeForLevel(entry.expirationLevel)
          if (maxAge !== Infinity && idleTime > maxAge) {
            storage.removeItem(key)
            cleaned++
          }
        } catch (err) {
          logger.warn('缓存项损坏，已从本地存储驱逐', {
            key,
            error: toErrorMessage(err),
          })
          storage.removeItem(key)
        }
      }
    }

    if (cleaned > 0) {
      logger.info('清理闲置缓存完成', { cleaned, defaultLevel: this.opts.defaultExpirationLevel })
    }
  }

  /** 强制执行缓存数量限制（前端 LRU 策略，禁止按 sourceTimestamp 驱逐） */
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
          const entry = this.parseCacheEntry(raw)
          if (entry === null) continue
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
    // 倒序遍历，避免删除后索引偏移
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i)
      if (k?.startsWith(this.opts.cachePrefix)) s.removeItem(k)
    }
  }
}

export function createFileLoader(options: FileLoadOptions): FileLoader {
  return new FileLoader(options)
}
