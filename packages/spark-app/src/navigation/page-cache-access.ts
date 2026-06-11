/**
 * @module @spark-appworks/spark-app:navigation/page-cache-access
 * 职责：提供 spark-app 应用壳中的 page cache access 能力，连接路由、导航、认证、插件、页面 UI 或 AI 桥接。
 * 边界：负责应用层编排，不下沉实现底层数据模型，也不直接改写组件包的渲染协议。
 * AI用途：排查页面打开、导航状态、权限上下文或应用侧 AI 接线时，用本模块确认 app 层入口。
 */
/**
 * PageCache 访问模块（基础设施层）
 *
 * start.ts 在启动阶段注入 PageCacheHandle，供非组件上下文同步访问。
 */
import type { PageCacheHandle } from './page-cache'

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
