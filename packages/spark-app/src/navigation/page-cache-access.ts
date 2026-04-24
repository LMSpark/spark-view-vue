/**
 * PageCache 访问模块（基础设施层）
 *
 * start.ts 在启动阶段注入 PageCacheHandle，供非组件上下文同步访问。
 */
import type { PageCacheHandle } from '@spark-view/spark-ai'

let _pageCacheHandle: PageCacheHandle | null = null

export function setPageCacheHandle(handle: PageCacheHandle): void {
  _pageCacheHandle = handle
}

export function getPageCacheHandle(): PageCacheHandle | null {
  return _pageCacheHandle
}

export function clearAllPageCache(): { size: number; keys: string[] } {
  if (!_pageCacheHandle) {
    return { size: 0, keys: [] }
  }
  return _pageCacheHandle.clearAllCache()
}

export function getPageCacheStats(): { size: number; keys: string[] } {
  return _pageCacheHandle?.getCacheStats() ?? { size: 0, keys: [] }
}
