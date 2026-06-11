/**
 * @module @spark-appworks/spark-app:navigation/page-cache
 * @spark-appworks/spark-app 的 navigation/page-cache 模块。
 * 导出 ClassModel symbol: PageCacheSource, PageCacheHandle（共 2 个 symbol）。
 */
/**
 * 页面配置缓存管理（spark-app 内聚）
 */

type PageCacheSource = {
  clearPageCache(pageId: string): void
  clearAllCache(): { size: number; keys: string[] }
  getCacheStats(): { size: number; keys: string[] }}

/** Page Cache Handle 的语义模型。 */
export type PageCacheHandle = {
  clearPageCache(pageId: string): void
  clearAllCache(): { size: number; keys: string[] }
  getCacheStats(): { size: number; keys: string[] }}

export function createPageCache(source: PageCacheSource): PageCacheHandle {
  return {
    clearPageCache(pageId: string): void {
      source.clearPageCache(pageId)
      if (typeof localStorage === 'undefined') return
      for (const file of PAGE_FILES) {
        const base = `${CACHE_PREFIX}/${pageId}/${file}`
        localStorage.removeItem(base)
        localStorage.removeItem(`${base}:raw`)
        localStorage.removeItem(`${base}:transform`)
      }
    },

    clearAllCache(): { size: number; keys: string[] } {
      const stats = source.clearAllCache()
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
      return source.getCacheStats()
    },
  }
}

const CACHE_PREFIX = 'spark_page_'
const PAGE_FILES: readonly string[] = ['rule.json', 'pagedata.json', 'script.js', 'style.css']
