/**
 * agent/business · VCM-native 业务注册适配器。
 *
 * VCM/LLM 语义：把业务 class + VCM metadata 桥接为 Agent 可执行的
 * VCM-native 7-tool runtime。这里不再合成旧 AiModule、path router 或 direct function tool。
 */

import type { AiJsonSchemaObject, AiJsonValue } from '../../json'
import {
  createClassModelDocumentFromModuleMetadata,
  resolveModuleMetadataJson,
  validateApiObjectMetadata,
  VcmNativeRuntime,
  type AiModuleMetadataJson,
  type ClassModelDocument,
  type VcmNativeKnowledgeProvider,
  type VcmNativeToolCheck,
  type VcmNativeToolResult,
  type VcmNativeToolSpec,
} from '../../vcm-native'
import {
  executeAiNativeScript,
} from '../native-runtime'
import { DefaultAiAgentSessionStore } from '../session/default-session-store'
import type { AiAgentSessionStore } from '../session/session-types'
import {
  AiAgentToolCheck,
  AiAgentToolResult,
  type AiAgentRuntimeHostContext,
  type AiAgentToolRuntime,
  type AiAgentToolRuntimeInspectReport,
  type AiAgentToolRuntimeKnowledgeProjection,
  type AiAgentToolSpec,
} from '../tool-runtime'
import type {
  AiAgentAfterFunctionCallOptions,
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentLifecycleDirective,
} from './lifecycle-types'
import type { AiAgentHost } from './ai-host'
import type { AiAgentInputContract } from './business-task'
import {
  AiAgentRegistration,
  type AiAgentRegistrationOptions,
  type AiAgentToolLoopNudgeContext,
} from './registration-types'
import type { EnrichFunctionCallFailureCommand } from '../tool-loop/function-call-recovery-enricher'
import { AiAgentRuntimeContext } from './scope-types'

type VcmNativeAgentAdapterConstructor<T> = new (...args: never[]) => T

export type VcmNativeAgentAdapterRegisterCommand<T> = Readonly<{
  host: AiAgentHost
  alias: string
  moduleClass: VcmNativeAgentAdapterConstructor<T>
  metadata: AiModuleMetadataJson
  options: VcmNativeAgentAdapterRegisterOptions<T>
}>

export type VcmNativeAgentAdapterRegistrationCommand<T> = Readonly<{
  moduleClass: VcmNativeAgentAdapterConstructor<T>
  metadata: AiModuleMetadataJson
  options: VcmNativeAgentAdapterRegisterOptions<T>
}>

export type VcmNativeAgentAdapterRegisterOptions<T> = Readonly<{
  moduleId?: string
  instance?: T
  constructArgs?: readonly unknown[]
  resolveInstance?: (context: AiAgentRuntimeContext) => T
  /** metadata 文档级 $defs；运行时 paramsSchema $ref 由 AJV 2020 解析。 */
  jsonSchemaDefs?: Readonly<Record<string, AiJsonSchemaObject>>
  knowledge?: VcmNativeKnowledgeProvider
  inputContract?: AiAgentInputContract
  sessionStore?: AiAgentSessionStore
  systemPrompt?: (instance: T, context: AiAgentRuntimeContext) => string | undefined
  beforeFunctionCall?: (
    instance: T,
    options: AiAgentBeforeFunctionCallOptions,
  ) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
  afterFunctionCall?: (
    instance: T,
    options: AiAgentAfterFunctionCallOptions,
  ) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
  onStartSession?: (instance: T, context: AiAgentRuntimeContext) => void | Promise<void>
  onEndBusinessInstance?: (
    instance: T,
    context: AiAgentRuntimeContext,
    directive: AiAgentLifecycleDirective,
  ) => void | Promise<void>
  releaseModuleInstance?: (instance: T, moduleInstanceId: string) => void
  toolLoopNudge?: (context: AiAgentToolLoopNudgeContext) => string | undefined
  executionToolNames?: ReadonlySet<string>
  planWithoutToolMarkers?: readonly string[]
  enrichRecoveryHints?: (command: EnrichFunctionCallFailureCommand) => readonly string[]
}>

export class VcmNativeAgentAdapter {
  public static register<T>(command: VcmNativeAgentAdapterRegisterCommand<T>): AiAgentHost {
    const registration = VcmNativeAgentAdapter.createRegistration({
      moduleClass: command.moduleClass,
      metadata: command.metadata,
      options: command.options,
    })
    return command.host.register(command.alias, registration)
  }

  public static createRegistration<T>(
    command: VcmNativeAgentAdapterRegistrationCommand<T>,
  ): AiAgentRegistration {
    const metadata = resolveModuleMetadataJson(command.metadata)
    validateApiObjectMetadata(metadata.rootApi)

    const instance = command.options.resolveInstance === undefined
      ? command.options.instance ?? constructModuleInstance(command.moduleClass, command.options.constructArgs ?? [])
      : command.options.instance
    const document = createClassModelDocumentFromModuleMetadata({
      module: command.metadata,
      ...(command.options.jsonSchemaDefs === undefined ? {} : { schemaDefs: command.options.jsonSchemaDefs }),
    })
    const runtime = new VcmNativeAgentToolRuntime({
      metadata: command.metadata,
      document,
      options: command.options,
      moduleClass: command.moduleClass,
      ...(instance === undefined ? {} : { instance }),
    })

    const lifecycleOptions = command.options
    const systemPrompt = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.systemPrompt)
    const beforeFunctionCall = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.beforeFunctionCall)
    const afterFunctionCall = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.afterFunctionCall)
    const onStartSession = bindInstanceLifecycle(lifecycleOptions, instance, lifecycleOptions.onStartSession)
    const registrationOptions: AiAgentRegistrationOptions = {
      moduleId: command.options.moduleId ?? metadata.rootApi.kind,
      name: metadata.rootApi.name,
      description: metadata.rootApi.description,
      runtime,
      sessionStore: command.options.sessionStore ?? new DefaultAiAgentSessionStore(),
      onEndBusinessInstance: async (context: AiAgentRuntimeContext, directive: AiAgentLifecycleDirective) => {
        const resolved = resolveLifecycleInstance(lifecycleOptions, instance, context)
        if (resolved !== undefined) {
          await lifecycleOptions.onEndBusinessInstance?.(resolved, context, directive)
        }
      },
      releaseModuleInstance: (moduleInstanceId: string) => {
        const resolved = resolveLifecycleInstance(
          lifecycleOptions,
          instance,
          createRuntimeContextForModuleInstance(command.options.moduleId ?? metadata.rootApi.kind, moduleInstanceId),
        )
        if (resolved !== undefined) {
          lifecycleOptions.releaseModuleInstance?.(resolved, moduleInstanceId)
        }
      },
      ...(command.options.inputContract === undefined ? {} : { inputContract: command.options.inputContract }),
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
      ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      ...(afterFunctionCall === undefined ? {} : { afterFunctionCall }),
      ...(onStartSession === undefined ? {} : { onStartSession }),
      ...(command.options.toolLoopNudge === undefined ? {} : { toolLoopNudge: command.options.toolLoopNudge }),
      ...(command.options.executionToolNames === undefined ? {} : { executionToolNames: command.options.executionToolNames }),
      ...(command.options.planWithoutToolMarkers === undefined ? {} : { planWithoutToolMarkers: command.options.planWithoutToolMarkers }),
      ...(command.options.enrichRecoveryHints === undefined ? {} : { enrichRecoveryHints: command.options.enrichRecoveryHints }),
    }
    return new AiAgentRegistration(registrationOptions)
  }
}

type VcmNativeAgentToolRuntimeOptions<T> = Readonly<{
  metadata: AiModuleMetadataJson
  document: ClassModelDocument
  options: VcmNativeAgentAdapterRegisterOptions<T>
  instance?: T
  moduleClass: VcmNativeAgentAdapterConstructor<T>
}>

class VcmNativeAgentToolRuntime<T> implements AiAgentToolRuntime {
  private readonly runtime: VcmNativeRuntime

  public constructor(private readonly adapterOptions: VcmNativeAgentToolRuntimeOptions<T>) {
    this.runtime = new VcmNativeRuntime({
      document: adapterOptions.document,
      ...(adapterOptions.options.knowledge === undefined ? {} : { knowledge: adapterOptions.options.knowledge }),
      scriptExecutor: async command => {
        const host = readRuntimeHostContext(command.host)
        const instance = this.resolveInstance(toRuntimeContext(host))
        const result = await executeAiNativeScript({
          instance,
          metadata: adapterOptions.metadata,
          host,
          ...(adapterOptions.options.jsonSchemaDefs === undefined
            ? {}
            : { schemaDefs: adapterOptions.options.jsonSchemaDefs }),
          script: command.script,
        })
        return toVcmNativeToolResult(result)
      },
    })
  }

  public getTools(): readonly AiAgentToolSpec[] {
    return this.runtime.getTools().map(toAgentToolSpec)
  }

  public async executeTool(
    toolName: string,
    args: Readonly<Record<string, AiJsonValue>>,
    host: AiAgentRuntimeHostContext,
  ): Promise<AiAgentToolResult<AiJsonValue>> {
    const result = await this.runtime.executeTool(toolName, args, host)
    return toAgentToolResult(result)
  }

  public projectKnowledge(): AiAgentToolRuntimeKnowledgeProjection {
    return {
      promptSnapshot: createVcmNativePromptSnapshot(this.adapterOptions.document),
    }
  }

  public inspect(): AiAgentToolRuntimeInspectReport {
    const findings = this.adapterOptions.document.diagnostics.map(diagnostic => ({
      level: diagnostic.level === 'warning' ? 'warn' as const : 'info' as const,
      code: diagnostic.code,
      message: diagnostic.message,
    }))
    return {
      status: findings.some(finding => finding.level === 'warn') ? 'warning' : 'ok',
      rootKinds: [this.adapterOptions.document.rootKind],
      moduleCount: Object.keys(this.adapterOptions.document.models).length,
      findings,
    }
  }

  private resolveInstance(context: AiAgentRuntimeContext): T {
    if (this.adapterOptions.options.resolveInstance !== undefined) {
      return this.adapterOptions.options.resolveInstance(context)
    }
    if (this.adapterOptions.instance !== undefined) return this.adapterOptions.instance
    return constructModuleInstance(
      this.adapterOptions.moduleClass,
      this.adapterOptions.options.constructArgs ?? [],
    )
  }
}

function toVcmNativeToolResult(result: AiAgentToolResult<AiJsonValue>): VcmNativeToolResult {
  return {
    ok: result.ok,
    ...(result.data === undefined ? {} : { data: result.data }),
    ...(result.checks === undefined ? {} : { checks: result.checks.map(toVcmNativeToolCheck) }),
    ...(result.state === undefined ? {} : { state: result.state }),
  }
}

function toVcmNativeToolCheck(check: AiAgentToolCheck): VcmNativeToolCheck {
  return {
    level: check.level,
    code: check.code,
    message: check.message,
    ...(check.hint === undefined ? {} : { hint: check.hint }),
  }
}

function toAgentToolResult(result: VcmNativeToolResult): AiAgentToolResult<AiJsonValue> {
  return new AiAgentToolResult({
    ok: result.ok,
    ...(result.data === undefined ? {} : { data: result.data }),
    ...(result.checks === undefined ? {} : { checks: result.checks.map(toAgentToolCheck) }),
    ...(result.state === undefined ? {} : { state: result.state }),
  })
}

function toAgentToolCheck(check: VcmNativeToolCheck): AiAgentToolCheck {
  return new AiAgentToolCheck(
    check.level,
    check.code,
    check.message,
    check.hint,
  )
}

function toAgentToolSpec(tool: VcmNativeToolSpec): AiAgentToolSpec {
  return {
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }
}

function createVcmNativePromptSnapshot(document: ClassModelDocument): string {
  const kinds = Object.keys(document.models).sort()
  return [
    'VCM-native 工具闭集：vcm_query, vcm_model_guide, vcm_attribute_guide, vcm_action_guide, vcm_script, human_question, agent_complete。',
    `根模型 kind="${document.rootKind}"；可查询模型: ${kinds.join(', ')}。`,
    '执行前先用 vcm_query 定位 kind/member；读写或调用前用 vcm_attribute_guide/vcm_action_guide 查看 schema、usageRules、failureModes。',
    '唯一执行入口是 vcm_script({ script })；script 是 async function body，this 绑定当前业务根实例，沿原生对象链调用。',
    '任务完成必须调用 agent_complete({ summary })；不要使用旧 module_* 工具、path 直调或 direct function tool。',
  ].join('\n')
}

function readRuntimeHostContext(value: unknown): AiAgentRuntimeHostContext {
  if (!isRuntimeHostContext(value)) {
    throw new Error('VCM-native script executor requires Agent host context.')
  }
  return value
}

function isRuntimeHostContext(value: unknown): value is AiAgentRuntimeHostContext {
  return value !== null
    && typeof value === 'object'
    && typeof Reflect.get(value, 'moduleId') === 'string'
    && typeof Reflect.get(value, 'moduleInstanceId') === 'string'
    && typeof Reflect.get(value, 'instanceId') === 'string'
}

function toRuntimeContext(host: AiAgentRuntimeHostContext): AiAgentRuntimeContext {
  return new AiAgentRuntimeContext(host.moduleId, host.moduleInstanceId, host.instanceId)
}

function constructModuleInstance<T>(
  moduleClass: VcmNativeAgentAdapterConstructor<T>,
  args: readonly unknown[],
): T {
  const instance: unknown = Reflect.construct(moduleClass, [...args])
  if (!isConstructedModuleInstance<T>(instance)) {
    throw new Error('Failed to construct module instance.')
  }
  return instance
}

function isConstructedModuleInstance<T>(value: unknown): value is T {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
}

function bindOptionalLifecycle<T, TArgs extends readonly unknown[], TResult>(
  instance: T,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  return callback === undefined ? undefined : (...args) => callback(instance, ...args)
}

function bindInstanceLifecycle<T, TArgs extends readonly unknown[], TResult>(
  options: VcmNativeAgentAdapterRegisterOptions<T>,
  instance: T | undefined,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  if (callback === undefined) return undefined
  if (instance !== undefined) return bindOptionalLifecycle(instance, callback)
  if (options.resolveInstance === undefined) return undefined
  return (...args: TArgs) => {
    const resolved = resolveLifecycleInstance(options, instance, readRuntimeContextFromLifecycleArgs(args))
    if (resolved === undefined) {
      throw new Error('VcmNativeAgentAdapter lifecycle callback requires a resolvable module instance.')
    }
    return callback(resolved, ...args)
  }
}

function resolveLifecycleInstance<T>(
  options: VcmNativeAgentAdapterRegisterOptions<T>,
  instance: T | undefined,
  context: AiAgentRuntimeContext,
): T | undefined {
  if (instance !== undefined) return instance
  if (options.resolveInstance === undefined) return undefined
  return options.resolveInstance(context)
}

function readRuntimeContextFromLifecycleArgs(args: readonly unknown[]): AiAgentRuntimeContext {
  const candidate = args[0]
  if (!(candidate instanceof AiAgentRuntimeContext)) {
    throw new Error('VcmNativeAgentAdapter lifecycle callback expected AiAgentRuntimeContext as the first argument.')
  }
  return candidate
}

function createRuntimeContextForModuleInstance(moduleId: string, moduleInstanceId: string): AiAgentRuntimeContext {
  return new AiAgentRuntimeContext(moduleId, moduleInstanceId, moduleInstanceId)
}
