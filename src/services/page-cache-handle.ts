import { PageDesignPageCache, type PageCacheHandle } from '@spark-view/spark-ai'

interface ConfigLoaderRef {
  clearCache(key?: string): void
  getCacheStats?(): { size: number; keys: string[] }
}

let pageCacheHandle: PageCacheHandle | null = null

export function initPageCacheHandle(loader: ConfigLoaderRef): void {
  pageCacheHandle = new PageDesignPageCache(loader)
}

export function clearAllPageCache(): { size: number; keys: string[] } {
  if (!pageCacheHandle) {
    throw new Error('Page cache handle not initialized')
  }
  return pageCacheHandle.clearAllCache()
}

export function getPageCacheStats(): { size: number; keys: string[] } {
  if (!pageCacheHandle) {
    return { size: 0, keys: [] }
  }
  return pageCacheHandle.getCacheStats()
}
