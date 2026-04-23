/**
 * AI 会话缓存统一管理器（应用层集成）。
 *
 * 包装 spark-component 的 aiSessionCache，在读写时自动向 useAiPanelStore 发事件。
 */
import { registerAiCacheEventHandler } from '@spark-view/spark-component'

export {
  SESSION_SNAPSHOT_PREFIX,
  PANEL_LAYOUT_PREFIX,
  ALL_AI_CACHE_PREFIXES,
  readCache,
  writeCache,
  removeCache,
  listCache,
  clearCacheByPrefix,
  clearSessionByPageId,
  type AiCacheEntry,
} from '@spark-view/spark-component'

/**
 * 自动在 useAiPanelStore 中注册缓存事件处理器。
 * 这确保应用层能够侦听缓存变化（埋点/审计）。
 */
export async function setupAiCacheEventBus(): Promise<void> {
  // 延迟加载以避免循环依赖
  const { useAiPanelStore } = await import('./useAiPanelStore')
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
