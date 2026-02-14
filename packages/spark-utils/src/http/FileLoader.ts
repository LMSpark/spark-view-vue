/**
 * 文件加载器 - 基于时间戳的智能缓存系统
 *
 * 流程：首次加载 → 缓存 content + timestamp → 再次请求带 timestamp →
 *       后端 304/notModified → 用缓存 | 200 → 更新缓存
 *       网络失败 → 降级到缓存
 */

import { Logger } from '../logger'
import { Request } from './Request'
import type { FileLoadOptions, FileCache, FileLoadResult } from './types'

const logger = Logger('FileLoader')

interface FileResponse {
  content: string
  timestamp: string
  notModified?: boolean
}

export class FileLoader {
  private opts: Required<FileLoadOptions>
  private memCache = new Map<string, FileCache>()
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

  /** 加载单个文件 */
  async load<T = unknown>(
    fileName: string,
    options?: { parseJSON?: boolean; forceRefresh?: boolean }
  ): Promise<FileLoadResult<T>> {
    const parseJSON = options?.parseJSON ?? true
    const forceRefresh = options?.forceRefresh ?? false

    try {
      const cache = forceRefresh ? null : this.getCache(fileName)
      const timestamp = cache?.timestamp ?? ''

      const params: Record<string, unknown> = {}
      if (timestamp) params.timestamp = timestamp

      const response = await this.request.requestFull<FileResponse>({
        url: fileName,
        method: 'GET',
        params
      })
      const result = response.data

      // 304 / notModified
      if (result.notModified === true) {
        if (cache) {
          return {
            success: true,
            data: parseJSON ? (JSON.parse(cache.content) as T) : (cache.content as T),
            timestamp: cache.timestamp,
            fromCache: true,
            notModified: true
          }
        }
        return { success: false, error: 'notModified 但无本地缓存', fromCache: false }
      }

      if (!result.content || !result.timestamp) {
        throw new Error('响应格式错误：缺少 content 或 timestamp')
      }

      // 解析数据
      let data: T
      if (parseJSON) {
        try { data = JSON.parse(result.content) as T }
        catch (e) { throw new Error(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`) }
      } else {
        data = result.content as T
      }

      // 更新缓存
      this.setCache(fileName, { content: result.content, timestamp: result.timestamp, cachedAt: Date.now() })

      return { success: true, data, timestamp: result.timestamp, fromCache: false }

    } catch (error) {
      // 降级到缓存
      if (this.opts.fallbackToCache) {
        const cache = this.getCache(fileName)
        if (cache) {
          const msg = error instanceof Error ? error.message : String(error)
          logger.warn('网络失败，使用缓存', { fileName, error: msg })
          try {
            const data = parseJSON ? (JSON.parse(cache.content) as T) : (cache.content as T)
            return { success: true, data, timestamp: cache.timestamp, fromCache: true, error: `降级缓存（${msg}）` }
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

  /** 清除缓存 */
  clearCache(fileName?: string): void {
    if (fileName) {
      const key = this.opts.cachePrefix + fileName
      this.memCache.delete(key)
      this.storageRemove(key)
    } else {
      this.memCache.clear()
      this.storageClearPrefix()
    }
  }

  /** 检查文件是否有缓存 */
  hasCache(fileName: string): boolean {
    return this.getCache(fileName) !== null
  }

  /** 获取缓存的时间戳 */
  getCachedTimestamp(fileName: string): string | null {
    return this.getCache(fileName)?.timestamp ?? null
  }

  // ==================== 缓存内部方法 ====================

  private getCache(fileName: string): FileCache | null {
    const key = this.opts.cachePrefix + fileName
    if (this.opts.storage === 'memory') return this.memCache.get(key) ?? null
    try {
      const raw = this.storage.getItem(key)
      return raw ? (JSON.parse(raw) as FileCache) : null
    } catch { return null }
  }

  private setCache(fileName: string, cache: FileCache): void {
    const key = this.opts.cachePrefix + fileName
    if (this.opts.storage === 'memory') { this.memCache.set(key, cache); return }
    try { this.storage.setItem(key, JSON.stringify(cache)) }
    catch (e) { logger.error('缓存写入失败', { key, error: e }) }
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
