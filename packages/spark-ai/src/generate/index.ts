/**
 * Generate module — 三阶段 FC 页面生成管线。
 *
 * @module generate
 */

export { runGenerateLoop } from './generate-orchestrator'
export type {
  GenerateConfig,
  GenerateProgressEvent,
  GenerateResult,
} from './generate-orchestrator'

export {
  getGenerateTools,
  getGenerateToolsForApi,
  dispatchQueryTool,
} from './generate-tools-catalog'
export type {
  FcToolDefinition,
  GenerateToolName,
  Phase,
} from './generate-tools-catalog'

export {
  validateToolLayerEmit,
  validateSemanticCrossPhase,
} from './generate-validators'
export type {
  GenerateArtifacts,
  ToolLayerValidationResult,
  SemanticValidationResult,
} from './generate-validators'

export { createGenerateSessionBackend } from './generate-session-backend'
export type { GenerateSessionBackendOptions } from './generate-session-backend'
