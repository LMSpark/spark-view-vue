/**
 * FileLoader — HTTP 文件加载 + 通用计算结果缓存
 *
 * 两种使用模式：
 *
 * 1. **文件加载**（HTTP）
 *    load<T>(fileName) → GET ?timestamp=<cached> → { content, timestamp, notModified? }
 *    自动将原始文件内容缓存为 CacheEntry<string>。
 *    下次加载若服务器返回 notModified，直接从缓存取并按需 JSON.parse。
 *
 * 2. **计算结果缓存**（任意数据）
 *    store<T>(key, data, sourceTimestamp)  — 缓存 DataSet / 编译脚本 / 编译 CSS / 编译规则等
 *    retrieve<T>(key, sourceTimestamp)     — sourceTimestamp 匹配则命中，否则返回 null
 *
 *    典型用法：
 *      const ts = await fileLoader.getTimestamp(filePath)  // 读文件时间戳
 *      const cached = fileLoader.retrieve<DataSet>(filePath + ':dataset', ts)
 *      if (cached) return cached
 *      const raw = await fileLoader.load(filePath)
 *      const ds = buildDataSet(raw.data)
 *      fileLoader.store(filePath + ':dataset', ds, raw.timestamp!)
 *      return ds
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

  /** 加载单个文件，自动缓存原始内容 */
  async load<T = unknown>(
    fileName: string,
    options?: { parseJSON?: boolean; forceRefresh?: boolean }
  ): Promise<FileLoadResult<T>> {
    const parseJSON = options?.parseJSON ?? true
    const forceRefresh = options?.forceRefresh ?? false

    const parse = (raw: string): T => {
      if (!parseJSON) return raw as T
      try { return JSON.parse(raw) as T }
      catch (e) { throw new Error(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`) }
    }

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

      // 服务器确认未变更
      if (result.notModified === true) {
        if (cached) {
          return {
            success: true,
            data: parse(cached.data),
            timestamp: cached.sourceTimestamp,
            fromCache: true,
            notModified: true
          }
        }
        return { success: false, error: 'notModified 但无本地缓存', fromCache: false }
      }

      if (!result.content || !result.timestamp) {
        throw new Error('响应格式错误：缺少 content 或 timestamp')
      }

      // 写原始内容缓存
      this.writeEntry<string>(fileName, result.content, result.timestamp)

      return { success: true, data: parse(result.content), timestamp: result.timestamp, fromCache: false }

    } catch (error) {
      if (this.opts.fallbackToCache) {
        const cached = this.readEntry<string>(fileName)
        if (cached) {
          const msg = error instanceof Error ? error.message : String(error)
          logger.warn('网络失败，使用缓存', { fileName, error: msg })
          try {
            return {
              success: true,
              data: parse(cached.data),
              timestamp: cached.sourceTimestamp,
              fromCache: true,
              error: `降级缓存（${msg}）`
            }
          } catch { /* 缓存无效，继续返回失败 */ }
        }
      }
      return { success: false, error: error instanceof Error ? error.message : String(error), fromCache: false }
    }
  }

  /** 批量加载（并行） */
  async loadBatch<T = unknown>(
    fileNames: string[],
    options?: { parseJSON?: boolean; forceRefresh?: boolean }
  ): Promise<Map<string, FileLoadResult<T>>> {
    const results = new Map<string, FileLoadResult<T>>()
    await Promise.all(
      fileNames.map(async (f) => { results.set(f, await this.load<T>(f, options)) })
    )
    return results
  }

  // ==================== 通用计算结果缓存 ====================

  /**
   * 缓存任意计算结果（DataSet、编译脚本、编译 CSS、编译规则等）。
   * @param key          — 缓存键（建议用 `filePath + ':type'` 形式区分同文件不同产物）
   * @param data         — 要缓存的数据，必须可被 JSON.stringify 序列化
   * @param sourceTimestamp — 数据来源时间戳（通常取自 load() 返回的 timestamp）
   */
  store<T>(key: string, data: T, sourceTimestamp: string): void {
    this.writeEntry<T>(key, data, sourceTimestamp)
  }

  /**
   * 取回计算结果缓存，时间戳不匹配时返回 null（源文件已更新，需重新计算）。
   * @param key              — 与 store() 一致的缓存键
   * @param sourceTimestamp  — 当前源文件时间戳；与缓存不一致则返回 null
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

  /** 获取缓存的时间戳（不存在则返回 null） */
  getTimestamp(key: string): string | null {
    return this.readEntry(key)?.sourceTimestamp ?? null
  }

  /** @deprecated 请使用 getTimestamp() */
  getCachedTimestamp(key: string): string | null {
    return this.getTimestamp(key)
  }

  // ==================== 内部存储 ====================

  private readEntry<T>(key: string): CacheEntry<T> | null {
    const k = this.opts.cachePrefix + key
    if (this.opts.storage === 'memory') return (this.memCache.get(k) as CacheEntry<T>) ?? null
    try {
      const raw = this.storage.getItem(k)
      return raw ? (JSON.parse(raw) as CacheEntry<T>) : null
    } catch { return null }
  }

  private writeEntry<T>(key: string, data: T, sourceTimestamp: string): void {
    const entry: CacheEntry<T> = { data, sourceTimestamp, cachedAt: Date.now() }
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
