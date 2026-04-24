/**
 * 页面配置缓存管理
 *
 * 管理 FileLoader 的 memCache + localStorage 双层缓存失效。
 * 职责单一：仅处理缓存清除和统计，不涉及 AI 逻辑 / SSE / 文件 I/O。
 */

// ─── ConfigLoader 引用（由启动代码注入） ──────────────────────────────────────

interface ConfigLoaderRef {
  clearCache(key?: string): void
  getCacheStats?(): { size: number; keys: string[] }
}

export interface PageCacheHandle {
  clearPageCache(pageId: string): void
  clearAllCache(): { size: number; keys: string[] }
  getCacheStats(): { size: number; keys: string[] }
}

export function createPageCache(loader: ConfigLoaderRef): PageCacheHandle {
  return {
    clearPageCache(pageId: string): void {
      for (const file of PAGE_FILES) {
        loader.clearCache(`/${pageId}/${file}`)
      }
      if (typeof localStorage === 'undefined') return
      for (const file of PAGE_FILES) {
        const base = `${CACHE_PREFIX}/${pageId}/${file}`
        localStorage.removeItem(base)
        localStorage.removeItem(`${base}:raw`)
        localStorage.removeItem(`${base}:transform`)
      }
    },

    clearAllCache(): { size: number; keys: string[] } {
      const stats = loader.getCacheStats?.() ?? { size: 0, keys: [] }
      loader.clearCache()
      if (typeof localStorage !== 'undefined') {
        const toRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(CACHE_PREFIX)) toRemove.push(key)
        }
        for (const key of toRemove) localStorage.removeItem(key)
      }
      return stats
    },

    getCacheStats(): { size: number; keys: string[] } {
      return loader.getCacheStats?.() ?? { size: 0, keys: [] }
    },
  }
}

// ─── 缓存失效 ────────────────────────────────────────────────────────────────

/** FileLoader 使用的 localStorage 缓存前缀 */
const CACHE_PREFIX = 'spark_page_'
/** 页面 4 文件 */
const PAGE_FILES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const

/**
 * 清除指定页面的全部缓存（memCache + localStorage）
 *
 * 优先使用注入的 configLoader.clearCache()（同时清除 memCache 和 localStorage），
 * 降级为直接清除 localStorage 键。
 */
