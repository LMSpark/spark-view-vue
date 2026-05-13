import {
  clearAllPageCache as clearAllSparkAppPageCache,
  getPageCacheHandle,
  getPageCacheStats as getSparkAppPageCacheStats,
} from '@spark-view/spark-app'

export function clearPageCache(pageId: string): void {
  getPageCacheHandle()?.clearPageCache(pageId)
}

export function clearAllPageCache(): { size: number; keys: string[] } {
  return clearAllSparkAppPageCache()
}

export function getPageCacheStats(): { size: number; keys: string[] } {
  return getSparkAppPageCacheStats()
}
