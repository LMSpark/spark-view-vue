/**
 * @module @spark-appworks/spark-app:ai/index
 * @spark-appworks/spark-app 的 ai/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  createAiRunAdapter,
  formatAiRunError,
  noopTraceSink,
} from './ai-run-adapter'

export type {
  AiRunAdapterCommand,
  AiRunAdapterOptions,
  AiRunAdapterRunStatus,
  AiRunAdapterState,
  AiRunAbortHandler,
  AiRunBeforeFunctionCall,
  AiRunErrorFormatter,
  AiRunHost,
  AiRunTraceSink,
} from './ai-run-adapter'

export {
  AiToolApprovalBridge,
  createAiToolApprovalBridge,
} from './tool-approval-bridge'

export type {
  AiToolApprovalBridgeListener,
  AiToolApprovalBridgeOptions,
  AiToolApprovalBridgeSnapshot,
  AiToolApprovalRequest,
  AiToolApprovalRequestIdFactory,
} from './tool-approval-bridge'
