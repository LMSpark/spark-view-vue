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
} from '../../vcm-native'
import { executeModuleScript } from './native-script-sandbox'
import { createAiApiScriptContext } from './native-script-context'

export type AiNativeRuntimeSchemaDefs = Readonly<Record<string, AiJsonSchema>>

export type AiNativeScriptContextCommand<TInstance = unknown> = Readonly<{
  instance: TInstance
  metadata: AiModuleMetadataJson
  host?: AiAgentRuntimeHostContext
  schemaDefs?: AiNativeRuntimeSchemaDefs
}>

export type AiNativeScriptRunCommand<TInstance = unknown> =
  AiNativeScriptContextCommand<TInstance> & Readonly<{
    script: string
  }>

export function createAiNativeScriptContext(
  command: AiNativeScriptContextCommand,
): Readonly<Record<string, unknown>> {
  const metadata = resolveModuleMetadataJson(command.metadata)
  validateApiObjectMetadata(metadata.rootApi)
  return createAiApiScriptContext(
    command.instance,
    metadata.rootApi,
    createNativePathContext(command.host),
    createSchemaValidateOptions(command.schemaDefs),
  )
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
