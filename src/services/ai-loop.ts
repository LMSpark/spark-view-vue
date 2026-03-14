/**
 * @deprecated 已迁移到 @spark-view/spark-app — 本文件为兼容桥接
 */
export {
  logUpdateSignal,
  onServerEvent,
  ServerEventType,
  onPageConfigChange,
  setAutoIterating,
  isAutoIterating,
  setConfigLoader,
  setDynamicRouter,
  clearPageCache,
  clearAllCache,
  getCacheStats,
  refreshRoutes,
  setupHotReload,
  writePageFiles,
  readPageFile,
  readPageFiles,
  PageLogCollector,
  AIPageLoop,
  pageRefreshKey,
  triggerPageRefresh,
  initAILoop,
  getAILoop,
  configureAILoopHttp,
} from '@spark-view/spark-app'
export type {
  PageFiles,
  AIResponse,
  LogSnapshot,
  AIPageLoopOptions,
  FileChangeEvent,
  ServerEventTypeName,
} from '@spark-view/spark-app'
