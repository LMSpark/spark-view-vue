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
  clearPageCache,
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
} from '@spark-view/spark-app'
export type {
  PageFiles,
  AIResponse,
  LogSnapshot,
  AIPageLoopOptions,
  FileChangeEvent,
  ServerEventTypeName,
} from '@spark-view/spark-app'
