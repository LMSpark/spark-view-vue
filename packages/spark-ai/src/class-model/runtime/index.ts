/**
 * @module @spark-appworks/spark-ai:class-model/runtime/index
 * @spark-appworks/spark-ai 的 class-model/runtime/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  createClassModelDocumentFromModuleMetadata,
  createClassModelDocumentFromRuntimeDocument,
} from '../class-model'

export {
  ClassModelRuntime,
} from './class-model-runtime'

export type {
  ClassModelRuntimeOptions,
  ClassModelScriptCommand,
  ClassModelScriptExecutor,
  ClassModelScriptExecutorResult,
  ClassModelToolArgs,
  ClassModelToolCheck,
  ClassModelToolResult,
  ClassModelToolSpec,
} from './class-model-runtime'
