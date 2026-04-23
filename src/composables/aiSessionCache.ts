/**
 * AI 会话缓存统一管理器。
 *
 * ── 职责 ──
 * 1. 收口所有 AI 会话相关的 localStorage 读写（消息快照、面板布局）。
 * 2. 统一前缀约定：
 *    - `spark-ai-session:*`    — 消息/工具日志快照（AiSessionSnapshot）
 *    - `app-ai-panel:*`        — 面板 UI 状态（layout / maximized 等）
 * 3. 每次 I/O 自动向 {@link useAiPanelStore} 的事件总线 emit
 *    `snapshot:restore / persist / clear`，业务可订阅做埋点/审计。
 * 4. 暴露管理型 API：枚举、批量清除，供设置页 / CacheManager 使用。
 *
 * 注意：本模块只处理"存/取/列举"三件事，不参与业务语义
 *       （不解析 snapshot 结构，也不做校验）。消费方自行解析。
 */
import { useAiPanelStore } from './useAiPanelStore'

// ── 前缀与命名空间 ──────────────────────────────────────────────────────────

/** 消息快照默认前缀：对应 useAiChat 的 `spark-ai-session:${pageId}` 约定。 */
export const SESSION_SNAPSHOT_PREFIX = 'spark-ai-session:'
/** 面板 UI 布局前缀。 */
export const PANEL_LAYOUT_PREFIX = 'app-ai-panel:'

/** 所有会话相关缓存前缀集合；用于"全部清除"默认扫描范围。 */
export const ALL_AI_CACHE_PREFIXES = [SESSION_SNAPSHOT_PREFIX, PANEL_LAYOUT_PREFIX] as const

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface AiCacheEntry {
  readonly key: string
  readonly size: number
  /** 若值是合法 JSON 且含 updatedAt，则回显；否则 undefined。 */
  readonly updatedAt?: string
  /** 若值是合法 JSON 且含 pageId，则回显；否则 undefined。 */
  readonly pageId?: string
}

// ── 内部工具 ────────────────────────────────────────────────────────────────

function hasLocalStorage(): boolean {
  return typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined'
}

function safeParseMeta(raw: string): { updatedAt?: string; pageId?: string } {
  try {
    const parsed = JSON.parse(raw) as { updatedAt?: unknown; pageId?: unknown }
    const out: { updatedAt?: string; pageId?: string } = {}
    if (typeof parsed.updatedAt === 'string') out.updatedAt = parsed.updatedAt
    if (typeof parsed.pageId === 'string') out.pageId = parsed.pageId
    return out
  } catch {
    return {}
  }
}

/**
 * 发事件但永不抛。
 * store 初始化时可能循环依赖未就绪，这里 try 包住。
 */
function safeEmit(
  event: 'snapshot:restore' | 'snapshot:persist' | 'snapshot:clear',
  payload: { storageKey: string; size?: number },
): void {
  try {
    const store = useAiPanelStore()
    if (event === 'snapshot:clear') {
      store.emit(event, { storageKey: payload.storageKey })
    } else {
      store.emit(event, { storageKey: payload.storageKey, size: payload.size ?? 0 })
    }
  } catch {
    /* ignore */
  }
}

// ── 基础读写（单条） ────────────────────────────────────────────────────────

/**
 * 读取一条缓存。命中时 emit `snapshot:restore`。
 */
export function readCache(key: string): string | null {
  if (!hasLocalStorage()) return null
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) safeEmit('snapshot:restore', { storageKey: key, size: raw.length })
    return raw
  } catch {
    return null
  }
}

/**
 * 写入一条缓存。发 `snapshot:persist`；持久化失败静默忽略（本地缓存非关键路径）。
 */
export function writeCache(key: string, raw: string): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(key, raw)
    safeEmit('snapshot:persist', { storageKey: key, size: raw.length })
  } catch {
    /* ignore quota/security errors */
  }
}

/**
 * 删除一条缓存。发 `snapshot:clear`。
 */
export function removeCache(key: string): void {
  if (!hasLocalStorage()) return
  try {
    localStorage.removeItem(key)
    safeEmit('snapshot:clear', { storageKey: key })
  } catch {
    /* ignore */
  }
}

// ── 管理型 API ──────────────────────────────────────────────────────────────

/**
 * 列举所有匹配前缀的缓存条目，按 updatedAt 倒序（无时间戳的排在最后）。
 *
 * @param prefix 要列举的前缀；默认只列消息快照。
 */
export function listCache(prefix: string = SESSION_SNAPSHOT_PREFIX): AiCacheEntry[] {
  if (!hasLocalStorage()) return []
  const entries: AiCacheEntry[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(prefix)) continue
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    const meta = safeParseMeta(raw)
    entries.push({
      key,
      size: raw.length,
      ...(meta.updatedAt !== undefined ? { updatedAt: meta.updatedAt } : {}),
      ...(meta.pageId !== undefined ? { pageId: meta.pageId } : {}),
    })
  }
  entries.sort((a, b) => {
    if (a.updatedAt && b.updatedAt) return b.updatedAt.localeCompare(a.updatedAt)
    if (a.updatedAt) return -1
    if (b.updatedAt) return 1
    return a.key.localeCompare(b.key)
  })
  return entries
}

/**
 * 按前缀批量清空。
 *
 * @returns 实际删除的条目数
 */
export function clearCacheByPrefix(prefix: string | readonly string[] = ALL_AI_CACHE_PREFIXES): number {
  if (!hasLocalStorage()) return 0
  const prefixes = typeof prefix === 'string' ? [prefix] : Array.from(prefix)
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (prefixes.some(p => key.startsWith(p))) toRemove.push(key)
  }
  for (const key of toRemove) removeCache(key)
  return toRemove.length
}

/**
 * 便捷 API：按 pageId 清除对应的会话快照。
 * 基于 `spark-ai-session:${pageId}` 的约定。
 */
export function clearSessionByPageId(pageId: string): void {
  removeCache(`${SESSION_SNAPSHOT_PREFIX}${pageId}`)
}
