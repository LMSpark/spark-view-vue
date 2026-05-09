import {
  clearAllPageCache as clearAllSparkAppPageCache,
  getPageCacheHandle,
  getPageCacheStats as getSparkAppPageCacheStats,
} from '@spark-view/spark-app'

interface ConfigLoaderRef {
  clearCache(key?: string): void
  getCacheStats?(): { size: number; keys: string[] }
}

export function initPageCacheHandle(loader: ConfigLoaderRef): void {
  void loader
}

export function clearPageCache(pageId: string): void {
  getPageCacheHandle()?.clearPageCache(pageId)
}

export function clearAllPageCache(): { size: number; keys: string[] } {
  return clearAllSparkAppPageCache()
}

export function getPageCacheStats(): { size: number; keys: string[] } {
  return getSparkAppPageCacheStats()
}
