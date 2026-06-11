/**
 * @module @spark-appworks/spark-ai:agent/native-runtime/native-script-runner
 * @spark-appworks/spark-ai 的 agent/native-runtime/native-script-runner 模块。
 * 导出 ClassModel symbol: AiNativeRuntimeSchemaDefs, AiNativeScriptContextCommand, AiNativeScriptRunCommand（共 3 个 symbol）。
 */
import type {
  AiJsonSchema,
  AiJsonSchemaValidateOptions,
  AiJsonValue,
} from '../../json'
import type { AiAgentRuntimeHostContext } from '../tool-runtime'
import { AiAgentToolResult } from '../tool-runtime'
import {
  resolveModuleMetadataJson,
  validateApiObjectMetadata,
  type AiModuleMetadataJson,
} from '../../class-model'
import { executeModuleScript } from './native-script-sandbox'
import { createAiApiScriptContext } from './native-script-context'

/** Ai Native Runtime Schema Defs 的语义模型。 */
export type AiNativeRuntimeSchemaDefs = Readonly<Record<string, AiJsonSchema>>

/** Ai Native Script Context Command 的命令参数。 */
export type AiNativeScriptContextCommand<TInstance = unknown> = Readonly<{
  instance: TInstance
  metadata: AiModuleMetadataJson
  host?: AiAgentRuntimeHostContext
  schemaDefs?: AiNativeRuntimeSchemaDefs
}>

/** Ai Native Script Run Command 的命令参数。 */
export type AiNativeScriptRunCommand<TInstance = unknown> =
  AiNativeScriptContextCommand<TInstance> & Readonly<{
    script: string
  }>

export function createAiNativeScriptContext(
  command: AiNativeScriptContextCommand,
): Readonly<Record<string, unknown>> {
  const metadata = resolveModuleMetadataJson(command.metadata)
  validateApiObjectMetadata(metadata.rootApi)
  return createAiApiScriptContext({
    instance: command.instance,
    api: metadata.rootApi,
    ctx: createNativePathContext(command.host),
    validateOptions: createSchemaValidateOptions(command.schemaDefs),
  })
}

export async function executeAiNativeScript(
  command: AiNativeScriptRunCommand,
): Promise<AiAgentToolResult<AiJsonValue>> {
  if (command.script.trim().length === 0) {
    return AiAgentToolResult.failCode(
      'SCRIPT_EMPTY',
      'native script body must not be empty.',
      '让 LLM 直接生成 async function body，例如 return { ... }；this 绑定当前业务根实例。',
    )
  }
  const context = createAiNativeScriptContext(command)
  return await executeModuleScript(command.script, context)
}

function createNativePathContext(host: AiAgentRuntimeHostContext | undefined): Readonly<{
  segments: readonly string[]
  host?: AiAgentRuntimeHostContext
}> {
  return host === undefined
    ? { segments: [] }
    : { segments: [], host }
}

function createSchemaValidateOptions(
  schemaDefs: AiNativeRuntimeSchemaDefs | undefined,
): AiJsonSchemaValidateOptions {
  return schemaDefs === undefined || Object.keys(schemaDefs).length === 0
    ? {}
    : { schemaDefs }
}
