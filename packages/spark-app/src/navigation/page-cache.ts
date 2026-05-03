/**
 * 页面配置缓存管理（spark-app 内聚）
 */

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

const CACHE_PREFIX = 'spark_page_'
const PAGE_FILES = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
