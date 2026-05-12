import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerAiCacheEventHandler,
  readCache,
  writeCache,
  removeCache,
  listCache,
  clearCacheByPrefix,
  clearSessionByPageId,
  SESSION_SNAPSHOT_PREFIX,
  PANEL_LAYOUT_PREFIX,
  ALL_AI_CACHE_PREFIXES,
} from '@spark-view/spark-component'
import { useAiPanelStore } from '@spark-view/spark-component'

async function setupAiCacheEventBus(): Promise<void> {
  const store = useAiPanelStore()

  registerAiCacheEventHandler('snapshot:restore', (payload: { storageKey: string; size: number }) => {
    store.emit('snapshot:restore', payload)
  })

  registerAiCacheEventHandler('snapshot:persist', (payload: { storageKey: string; size: number }) => {
    store.emit('snapshot:persist', payload)
  })

  registerAiCacheEventHandler('snapshot:clear', (payload: { storageKey: string }) => {
    store.emit('snapshot:clear', payload)
  })
}

describe('aiSessionCache', () => {
  beforeEach(async () => {
    localStorage.clear()
    // 初始化缓存事件总线，使 spark-component 的事件可以转发到 useAiPanelStore
    await setupAiCacheEventBus()
  })

  it('readCache returns null for missing key (no event)', () => {
    const spy = vi.fn()
    const unsub = useAiPanelStore().on('snapshot:restore', spy)
    expect(readCache('nope')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    unsub()
  })

  it('readCache emits snapshot:restore on hit', () => {
    localStorage.setItem('k', 'abc')
    const spy = vi.fn()
    const unsub = useAiPanelStore().on('snapshot:restore', spy)
    expect(readCache('k')).toBe('abc')
    expect(spy).toHaveBeenCalledWith({ storageKey: 'k', size: 3 })
    unsub()
  })

  it('writeCache persists and emits snapshot:persist', () => {
    const spy = vi.fn()
    const unsub = useAiPanelStore().on('snapshot:persist', spy)
    writeCache('k', 'abcd')
    expect(localStorage.getItem('k')).toBe('abcd')
    expect(spy).toHaveBeenCalledWith({ storageKey: 'k', size: 4 })
    unsub()
  })

  it('removeCache deletes and emits snapshot:clear', () => {
    localStorage.setItem('k', 'x')
    const spy = vi.fn()
    const unsub = useAiPanelStore().on('snapshot:clear', spy)
    removeCache('k')
    expect(localStorage.getItem('k')).toBeNull()
    expect(spy).toHaveBeenCalledWith({ storageKey: 'k' })
    unsub()
  })

  it('listCache returns entries matching prefix, sorted by updatedAt desc', () => {
    localStorage.setItem(
      `${SESSION_SNAPSHOT_PREFIX}old`,
      JSON.stringify({ updatedAt: '2025-01-01T00:00:00Z', pageId: 'old' }),
    )
    localStorage.setItem(
      `${SESSION_SNAPSHOT_PREFIX}new`,
      JSON.stringify({ updatedAt: '2026-05-01T00:00:00Z', pageId: 'new' }),
    )
    localStorage.setItem('other:key', 'x')

    const list = listCache(SESSION_SNAPSHOT_PREFIX)
    expect(list).toHaveLength(2)
    expect(list[0]?.key).toBe(`${SESSION_SNAPSHOT_PREFIX}new`)
    expect(list[0]?.pageId).toBe('new')
    expect(list[1]?.pageId).toBe('old')
  })

  it('listCache tolerates malformed JSON values', () => {
    localStorage.setItem(`${SESSION_SNAPSHOT_PREFIX}bad`, 'not-json')
    const list = listCache(SESSION_SNAPSHOT_PREFIX)
    expect(list).toHaveLength(1)
    expect(list[0]?.updatedAt).toBeUndefined()
    expect(list[0]?.size).toBe('not-json'.length)
  })

  it('clearCacheByPrefix removes all matching and returns count', () => {
    localStorage.setItem(`${SESSION_SNAPSHOT_PREFIX}a`, '1')
    localStorage.setItem(`${SESSION_SNAPSHOT_PREFIX}b`, '2')
    localStorage.setItem(`${PANEL_LAYOUT_PREFIX}layout`, '3')
    localStorage.setItem('unrelated', '4')

    const n = clearCacheByPrefix(SESSION_SNAPSHOT_PREFIX)
    expect(n).toBe(2)
    expect(localStorage.getItem(`${SESSION_SNAPSHOT_PREFIX}a`)).toBeNull()
    expect(localStorage.getItem(`${PANEL_LAYOUT_PREFIX}layout`)).toBe('3')
    expect(localStorage.getItem('unrelated')).toBe('4')
  })

  it('clearCacheByPrefix default nukes all AI prefixes', () => {
    localStorage.setItem(`${SESSION_SNAPSHOT_PREFIX}a`, '1')
    localStorage.setItem(`${PANEL_LAYOUT_PREFIX}layout`, '2')
    localStorage.setItem('unrelated', '3')

    const n = clearCacheByPrefix(ALL_AI_CACHE_PREFIXES)
    expect(n).toBe(2)
    expect(localStorage.getItem('unrelated')).toBe('3')
  })

  it('clearSessionByPageId removes only that page snapshot', () => {
    localStorage.setItem(`${SESSION_SNAPSHOT_PREFIX}page-1`, 'x')
    localStorage.setItem(`${SESSION_SNAPSHOT_PREFIX}page-2`, 'y')
    clearSessionByPageId('page-1')
    expect(localStorage.getItem(`${SESSION_SNAPSHOT_PREFIX}page-1`)).toBeNull()
    expect(localStorage.getItem(`${SESSION_SNAPSHOT_PREFIX}page-2`)).toBe('y')
  })
})
