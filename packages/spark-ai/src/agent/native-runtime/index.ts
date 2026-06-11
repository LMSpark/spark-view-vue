/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/index
 * @spark-appworks/spark-ai 的 agent/native-runtime/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  AiApiScriptActionFailure,
  createAiApiScriptContext,
  createAiApiScriptContext as createAiNativeApiScriptContext,
  executeAiApiAction,
} from './native-script-context'

export {
  createAiNativeScriptContext,
  executeAiNativeScript,
} from './native-script-runner'

export {
  createDtsNativeModuleMetadata,
  executeDtsNativeScript,
} from './dts-native-script-runner'

export type {
  AiApiScriptContextCommand,
  ExecuteAiApiActionCommand,
} from './native-script-context'

export type {
  AiNativeRuntimeSchemaDefs,
  AiNativeScriptContextCommand,
  AiNativeScriptRunCommand,
} from './native-script-runner'

export type {
  DtsNativeScriptRunCommand,
} from './dts-native-script-runner'
