/**
 * @deprecated 已迁移到 @spark-view/spark-app — 本文件为兼容桥接
 *
 * 导航函数（refreshRoutes / getNavTree / getNavHomePath）请直接从 @spark-view/spark-app 导入。
 */
export {
  logUpdateSignal,
  onServerEvent,
  ServerEventType,
  onPageConfigChange,
  setAutoIterating,
  isAutoIterating,
  setConfigLoader,
  clearPageCache,
  clearAllCache,
  getCacheStats,
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
