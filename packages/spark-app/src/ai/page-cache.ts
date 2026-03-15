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

/** ConfigLoader 实例引用，需由启动代码通过 setConfigLoader 注入 */
let _configLoader: ConfigLoaderRef | null = null

/** 注册 ConfigLoader 实例（start.ts / AiChatPanel 中调用） */
export function setConfigLoader(loader: ConfigLoaderRef): void {
  _configLoader = loader
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
export function clearPageCache(pageId: string): void {
  if (_configLoader) {
    // 通过 FileLoader.clearCache 同时清除 memCache + localStorage
    for (const file of PAGE_FILES) {
      _configLoader.clearCache(`/${pageId}/${file}`)
    }
    return
  }
  // 降级：未注入 configLoader 时仅清除 localStorage
  if (typeof localStorage === 'undefined') return
  for (const file of PAGE_FILES) {
    const base = `${CACHE_PREFIX}/${pageId}/${file}`
    localStorage.removeItem(base)
    localStorage.removeItem(`${base}:raw`)
    localStorage.removeItem(`${base}:transform`)
  }
}

/**
 * 清除所有页面配置缓存（memCache + localStorage）
 * @returns 清除前的缓存统计
 */
export function clearAllCache(): { size: number; keys: string[] } {
  const stats = _configLoader?.getCacheStats?.() ?? { size: 0, keys: [] }
  if (_configLoader) {
    _configLoader.clearCache()
  }
  // 降级：清除 localStorage 前缀匹配项
  if (typeof localStorage !== 'undefined') {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(CACHE_PREFIX)) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  }
  return stats
}

/** 获取当前缓存统计 */
export function getCacheStats(): { size: number; keys: string[] } {
  return _configLoader?.getCacheStats?.() ?? { size: 0, keys: [] }
}
