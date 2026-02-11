/**
 * 文件加载器 - 基于时间戳的智能缓存系统
 * 
 * ## 核心机制
 * 
 * 1. **首次加载**：
 *    - 前端：GET /api/config/home/rule.json?timestamp=
 *    - 后端：200 { content: "...", timestamp: "2024-02-11T10:00:00Z" }
 *    - 前端：缓存 content + timestamp
 * 
 * 2. **再次加载（文件未变化）**：
 *    - 前端：GET /api/config/home/rule.json?timestamp=2024-02-11T10:00:00Z
 *    - 后端：304 Not Modified 或 { notModified: true }
 *    - 前端：使用缓存
 * 
 * 3. **文件已更新**：
 *    - 前端：GET /api/config/home/rule.json?timestamp=2024-02-11T10:00:00Z
 *    - 后端：200 { content: "...", timestamp: "2024-02-11T12:00:00Z" }
 *    - 前端：更新缓存
 * 
 * 4. **网络失败**：
 *    - 自动降级：使用缓存（如果有）
 *    - 无缓存：返回失败
 * 
 * @module FileLoader
 */

import { Logger } from './logger'

const logger = Logger('FileLoader')

/* -----------------------------------------------------------------------------
 * 类型定义
 * -------------------------------------------------------------------------- */

/**
 * 文件加载选项
 */
export interface FileLoadOptions {
  /** API 基础路径 */
  baseUrl: string
  
  /** 缓存存储方式 */
  storage?: 'localStorage' | 'sessionStorage' | 'memory'
  
  /** 缓存键前缀 */
  cachePrefix?: string
  
  /** 网络请求超时时间（毫秒） */
  timeout?: number
  
  /** 自定义请求头 */
  headers?: Record<string, string>
  
  /** 网络失败时自动降级到缓存 */
  fallbackToCache?: boolean
}

/**
 * 文件缓存数据结构
 */
export interface FileCache {
  /** 文件内容（字符串） */
  content: string
  
  /** 文件时间戳（后端返回） */
  timestamp: string
  
  /** 缓存时间（本地时间戳） */
  cachedAt: number
}

/**
 * 文件加载结果
 */
export interface FileLoadResult<T = unknown> {
  /** 是否成功 */
  success: boolean
  
  /** 文件内容（已解析） */
  data?: T
  
  /** 文件时间戳 */
  timestamp?: string
  
  /** 是否来自缓存 */
  fromCache: boolean
  
  /** 错误信息 */
  error?: string
  
  /** 是否为 304 Not Modified */
  notModified?: boolean
}

/**
 * 后端响应格式
 */
interface FileResponse {
  /** 文件内容 */
  content: string
  
  /** 文件时间戳 */
  timestamp: string
  
  /** 是否未修改（约定值） */
  notModified?: boolean
}

/* -----------------------------------------------------------------------------
 * FileLoader 类
 * -------------------------------------------------------------------------- */

/**
 * 文件加载器
 * 
 * @example
 * ```typescript
 * // 创建加载器
 * const loader = createFileLoader({
 *   baseUrl: '/api/config',
 *   storage: 'localStorage',
 *   fallbackToCache: true
 * })
 * 
 * // 加载文件
 * const result = await loader.load('home/rule.json')
 * if (result.success) {
 *   console.log('数据:', result.data)
 *   console.log('来自缓存:', result.fromCache)
 * }
 * 
 * // 批量加载
 * const results = await loader.loadBatch([
 *   'home/rule.json',
 *   'home/pagedata.json',
 *   'home/script.js'
 * ])
 * 
 * // 清除缓存
 * loader.clearCache('home/rule.json')
 * ```
 */
export class FileLoader {
  private options: Required<FileLoadOptions>
  private memoryCache = new Map<string, FileCache>()
  
  constructor(options: FileLoadOptions) {
    this.options = {
      storage: 'localStorage',
      cachePrefix: 'spark_file_',
      timeout: 10000,
      headers: {},
      fallbackToCache: true,
      ...options
    }
    
    logger.debug('FileLoader 已创建', {
      baseUrl: this.options.baseUrl,
      storage: this.options.storage,
      fallbackToCache: this.options.fallbackToCache
    })
  }
  
  /**
   * 加载文件（支持自动缓存和降级）
   * 
   * @param fileName - 文件路径（相对于 baseUrl）
   * @param options - 加载选项
   * @returns 文件加载结果
   * 
   * @example
   * ```typescript
   * // 加载 JSON 文件（自动解析）
   * const result = await loader.load('home/rule.json')
   * 
   * // 加载文本文件（不解析）
   * const result = await loader.load('home/script.js', { parseJSON: false })
   * 
   * // 强制刷新（忽略缓存）
   * const result = await loader.load('home/rule.json', { forceRefresh: true })
   * ```
   */
  async load<T = unknown>(
    fileName: string,
    options?: {
      /** 是否解析为 JSON（默认 true） */
      parseJSON?: boolean
      /** 强制刷新（忽略缓存时间戳） */
      forceRefresh?: boolean
    }
  ): Promise<FileLoadResult<T>> {
    const parseJSON = options?.parseJSON ?? true
    const forceRefresh = options?.forceRefresh ?? false
    
    logger.debug('开始加载文件', { fileName, parseJSON, forceRefresh })
    
    try {
      // 1. 获取缓存的时间戳
      const cache = forceRefresh ? null : this.getCache(fileName)
      const timestamp = cache?.timestamp ?? ''
      
      logger.debug('缓存状态', { 
        fileName, 
        hasCache: !!cache, 
        timestamp: timestamp || '(empty)' 
      })
      
      // 2. 构造请求 URL
      const url = new URL(fileName, this.options.baseUrl)
      if (timestamp) {
        url.searchParams.set('timestamp', timestamp)
      }
      
      // 3. 发起请求（带超时控制）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.options.timeout)
      
      logger.debug('发起请求', { url: url.toString() })
      
      const response = await fetch(url.toString(), {
        headers: this.options.headers,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      // 4. 处理 304 Not Modified
      if (response.status === 304) {
        logger.info('文件未修改 (304)', { fileName })
        
        if (cache) {
          return {
            success: true,
            data: parseJSON ? (JSON.parse(cache.content) as T) : (cache.content as T),
            timestamp: cache.timestamp,
            fromCache: true,
            notModified: true
          }
        } else {
          logger.warn('收到 304 但本地无缓存', { fileName })
          return {
            success: false,
            error: '服务器返回 304 但本地无缓存',
            fromCache: false
          }
        }
      }
      
      // 5. 处理其他 HTTP 错误
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      // 6. 解析响应
      const result = await response.json() as FileResponse
      
      // 7. 处理约定的 notModified 标志
      if (result.notModified === true) {
        logger.info('文件未修改 (notModified=true)', { fileName })
        
        if (cache) {
          return {
            success: true,
            data: parseJSON ? (JSON.parse(cache.content) as T) : (cache.content as T),
            timestamp: cache.timestamp,
            fromCache: true,
            notModified: true
          }
        } else {
          logger.warn('收到 notModified 但本地无缓存', { fileName })
          return {
            success: false,
            error: '服务器返回 notModified 但本地无缓存',
            fromCache: false
          }
        }
      }
      
      // 8. 验证响应格式
      if (!result.content || !result.timestamp) {
        throw new Error('响应格式错误：缺少 content 或 timestamp')
      }
      
      logger.info('文件加载成功', { 
        fileName, 
        timestamp: result.timestamp,
        size: result.content.length
      })
      
      // 9. 更新缓存
      this.setCache(fileName, {
        content: result.content,
        timestamp: result.timestamp,
        cachedAt: Date.now()
      })
      
      // 10. 返回结果
      return {
        success: true,
        data: parseJSON ? (JSON.parse(result.content) as T) : (result.content as T),
        timestamp: result.timestamp,
        fromCache: false
      }
      
    } catch (error) {
      logger.error('文件加载失败', { fileName, error })
      
      // 11. 自动降级到缓存
      if (this.options.fallbackToCache) {
        const cache = this.getCache(fileName)
        if (cache) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          logger.warn('网络失败，使用缓存', { fileName, error: errorMsg })
          
          return {
            success: true,
            data: parseJSON ? (JSON.parse(cache.content) as T) : (cache.content as T),
            timestamp: cache.timestamp,
            fromCache: true,
            error: `网络失败，使用缓存（${errorMsg}）`
          }
        }
      }
      
      // 12. 无缓存可用，返回失败
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        fromCache: false
      }
    }
  }
  
  /**
   * 批量加载文件（并行）
   * 
   * @param fileNames - 文件路径数组
   * @param options - 加载选项
   * @returns Map<文件名, 加载结果>
   * 
   * @example
   * ```typescript
   * const results = await loader.loadBatch([
   *   'home/rule.json',
   *   'home/pagedata.json'
   * ])
   * 
   * const ruleResult = results.get('home/rule.json')
   * if (ruleResult?.success) {
   *   console.log('规则:', ruleResult.data)
   * }
   * ```
   */
  async loadBatch<T = unknown>(
    fileNames: string[],
    options?: {
      parseJSON?: boolean
      forceRefresh?: boolean
    }
  ): Promise<Map<string, FileLoadResult<T>>> {
    logger.debug('批量加载文件', { count: fileNames.length, fileNames })
    
    const results = new Map<string, FileLoadResult<T>>()
    
    // 并行加载所有文件
    await Promise.all(
      fileNames.map(async (fileName) => {
        const result = await this.load<T>(fileName, options)
        results.set(fileName, result)
      })
    )
    
    const successCount = Array.from(results.values()).filter(r => r.success).length
    logger.info('批量加载完成', { 
      total: fileNames.length, 
      success: successCount,
      failed: fileNames.length - successCount
    })
    
    return results
  }
  
  /**
   * 获取缓存
   */
  private getCache(fileName: string): FileCache | null {
    const cacheKey = this.options.cachePrefix + fileName
    
    switch (this.options.storage) {
      case 'memory':
        return this.memoryCache.get(cacheKey) ?? null
        
      case 'localStorage':
      case 'sessionStorage': {
        const storage = this.options.storage === 'localStorage' 
          ? localStorage 
          : sessionStorage
        
        try {
          const cached = storage.getItem(cacheKey)
          return cached ? (JSON.parse(cached) as FileCache) : null
        } catch (error) {
          logger.warn('读取缓存失败', { cacheKey, error })
          return null
        }
      }
    }
  }
  
  /**
   * 设置缓存
   */
  private setCache(fileName: string, cache: FileCache): void {
    const cacheKey = this.options.cachePrefix + fileName
    
    switch (this.options.storage) {
      case 'memory':
        this.memoryCache.set(cacheKey, cache)
        logger.debug('缓存已存储 (memory)', { fileName })
        break
        
      case 'localStorage':
      case 'sessionStorage': {
        const storage = this.options.storage === 'localStorage' 
          ? localStorage 
          : sessionStorage
        
        try {
          storage.setItem(cacheKey, JSON.stringify(cache))
          logger.debug(`缓存已存储 (${this.options.storage})`, { fileName })
        } catch (error) {
          logger.error('存储缓存失败', { cacheKey, error })
        }
        break
      }
    }
  }
  
  /**
   * 清除缓存
   * 
   * @param fileName - 文件名（可选，不传则清除所有缓存）
   * 
   * @example
   * ```typescript
   * // 清除单个文件缓存
   * loader.clearCache('home/rule.json')
   * 
   * // 清除所有缓存
   * loader.clearCache()
   * ```
   */
  clearCache(fileName?: string): void {
    if (fileName) {
      const cacheKey = this.options.cachePrefix + fileName
      this.memoryCache.delete(cacheKey)
      
      if (this.options.storage === 'localStorage') {
        localStorage.removeItem(cacheKey)
      } else if (this.options.storage === 'sessionStorage') {
        sessionStorage.removeItem(cacheKey)
      }
      
      logger.info('缓存已清除', { fileName })
    } else {
      // 清除所有缓存
      this.memoryCache.clear()
      
      if (this.options.storage === 'localStorage') {
        this.clearStorageByPrefix(localStorage)
      } else if (this.options.storage === 'sessionStorage') {
        this.clearStorageByPrefix(sessionStorage)
      }
      
      logger.info('所有缓存已清除')
    }
  }
  
  /**
   * 清除特定前缀的所有 Storage 键
   */
  private clearStorageByPrefix(storage: Storage): void {
    const keys = Object.keys(storage).filter(key => 
      key.startsWith(this.options.cachePrefix)
    )
    keys.forEach(key => storage.removeItem(key))
    logger.debug('Storage 缓存已清除', { count: keys.length })
  }
  
  /**
   * 获取缓存统计信息
   * 
   * @returns 缓存统计数据
   * 
   * @example
   * ```typescript
   * const stats = loader.getCacheStats()
   * console.log('缓存文件数:', stats.totalFiles)
   * console.log('缓存总大小:', stats.totalSize, 'bytes')
   * console.log('最旧缓存:', new Date(stats.oldestCache))
   * ```
   */
  getCacheStats(): {
    /** 缓存文件总数 */
    totalFiles: number
    /** 缓存总大小（字节） */
    totalSize: number
    /** 最旧缓存时间（毫秒时间戳） */
    oldestCache: number
    /** 最新缓存时间（毫秒时间戳） */
    newestCache: number
  } {
    const caches: FileCache[] = []
    
    if (this.options.storage === 'memory') {
      caches.push(...this.memoryCache.values())
    } else {
      const storage = this.options.storage === 'localStorage' 
        ? localStorage 
        : sessionStorage
      
      Object.keys(storage).forEach(key => {
        if (key.startsWith(this.options.cachePrefix)) {
          try {
            const item = storage.getItem(key)
            if (item) {
              const cache = JSON.parse(item) as FileCache
              caches.push(cache)
            }
          } catch (error) {
            logger.warn('解析缓存失败', { key, error })
          }
        }
      })
    }
    
    if (caches.length === 0) {
      return { totalFiles: 0, totalSize: 0, oldestCache: 0, newestCache: 0 }
    }
    
    const totalSize = caches.reduce((sum, c) => sum + c.content.length, 0)
    const times = caches.map(c => c.cachedAt)
    
    return {
      totalFiles: caches.length,
      totalSize,
      oldestCache: Math.min(...times),
      newestCache: Math.max(...times)
    }
  }
  
  /**
   * 检查文件是否有缓存
   * 
   * @param fileName - 文件名
   * @returns 是否有缓存
   */
  hasCache(fileName: string): boolean {
    return this.getCache(fileName) !== null
  }
  
  /**
   * 获取缓存的时间戳（不加载文件）
   * 
   * @param fileName - 文件名
   * @returns 时间戳（如果有缓存）
   */
  getCachedTimestamp(fileName: string): string | null {
    const cache = this.getCache(fileName)
    return cache?.timestamp ?? null
  }
}

/* -----------------------------------------------------------------------------
 * 工厂函数
 * -------------------------------------------------------------------------- */

/**
 * 创建文件加载器实例
 * 
 * @param options - 加载器选项
 * @returns FileLoader 实例
 * 
 * @example
 * ```typescript
 * const loader = createFileLoader({
 *   baseUrl: '/api/config',
 *   storage: 'localStorage',
 *   timeout: 5000,
 *   fallbackToCache: true
 * })
 * ```
 */
export function createFileLoader(options: FileLoadOptions): FileLoader {
  return new FileLoader(options)
}
