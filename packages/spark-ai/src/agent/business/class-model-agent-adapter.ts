/**
 * @module @spark-appworks/spark-ai:agent/business/class-model-agent-adapter
 * 职责：把业务 class、DTS ClassModel bundle 和知识服务适配为 Agent 可注册的 ClassModel 7-tool runtime。
 * 边界：只做 ClassModel 业务注册适配，不恢复旧 AiModule/path router，也不绕过统一工具闭集直接调用函数。
 * AI用途：新增或排查 ClassModel 驱动的业务 Agent 时，用本模块确认 metadata、runtime 和 registration 的接线方式。
 */

import type { AiJsonSchemaObject, AiJsonValue } from '../../json'
import {
  auditClassModelReflectionConnectivity,
  collectClassModelFailureModeRecoveryHints,
  createClassModelDocumentFromModuleMetadata,
  listAttributeReachableKinds,
  resolveModuleMetadataJson,
  validateApiObjectMetadata,
  ClassModelRuntime,
  type AiModuleMetadataJson,
  type ClassModelDocument,
  type ClassModelReflectionConnectivityIssue,
  type ClassModelKnowledgeProvider,
  type ClassModelToolCheck,
  type ClassModelToolResult,
  type ClassModelToolSpec,
} from '../../class-model'
import {
  executeDtsNativeScript,
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

/** Class Model Agent Adapter Constructor 的语义模型。 */
type ClassModelAgentAdapterConstructor<T> = new (...args: never[]) => T

/** Class Model Agent Adapter Register Command 的命令参数。 */
export type ClassModelAgentAdapterRegisterCommand<T> = Readonly<{
  host: AiAgentHost
  alias: string
  moduleClass: ClassModelAgentAdapterConstructor<T>
  metadata?: AiModuleMetadataJson
  options: ClassModelAgentAdapterRegisterOptions<T>
}>

/** Class Model Agent Adapter Registration Command 的命令参数。 */
export type ClassModelAgentAdapterRegistrationCommand<T> = Readonly<{
  moduleClass: ClassModelAgentAdapterConstructor<T>
  metadata?: AiModuleMetadataJson
  options: ClassModelAgentAdapterRegisterOptions<T>
}>

/** Class Model Agent Adapter Register Options 的调用配置。 */
export type ClassModelAgentAdapterRegisterOptions<T> = Readonly<{
  moduleId?: string
  instance?: T
  constructArgs?: readonly unknown[]
  resolveInstance?: (context: AiAgentRuntimeContext) => T
  /** metadata 文档级 $defs；运行时 paramsSchema $ref 由 AJV 2020 解析。 */
  jsonSchemaDefs?: Readonly<Record<string, AiJsonSchemaObject>>
  dtsClassModelManifestUrl?: string
  rootClassName?: string
  knowledge?: ClassModelKnowledgeProvider
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

/** Class Model Agent Adapter 的语义模型。 */
export class ClassModelAgentAdapter {
    /** 执行 register 操作。 */
public static register<T>(command: ClassModelAgentAdapterRegisterCommand<T>): AiAgentHost {
    const registration = ClassModelAgentAdapter.createRegistration({
      moduleClass: command.moduleClass,
      ...(command.metadata === undefined ? {} : { metadata: command.metadata }),
      options: command.options,
    })
    return command.host.register(command.alias, registration)
  }

    /** 创建 Registration。 */
public static createRegistration<T>(
    command: ClassModelAgentAdapterRegistrationCommand<T>,
  ): AiAgentRegistration {
    const metadata = command.metadata === undefined
      ? undefined
      : resolveModuleMetadataJson(command.metadata)
    if (metadata !== undefined) validateApiObjectMetadata(metadata.rootApi)
    const rootClassName = metadata?.rootApi.kind ?? command.options.rootClassName ?? command.moduleClass.name

    const instance = command.options.resolveInstance === undefined
      ? command.options.instance ?? constructModuleInstance(command.moduleClass, command.options.constructArgs ?? [])
      : command.options.instance
    const document = metadata === undefined
      ? undefined
      : createClassModelDocumentFromModuleMetadata({
          module: metadata,
          ...(command.options.jsonSchemaDefs === undefined ? {} : { schemaDefs: command.options.jsonSchemaDefs }),
        })
    const runtime = new ClassModelAgentToolRuntime({
      ...(metadata === undefined ? {} : { metadata }),
      ...(document === undefined ? {} : { document }),
      rootClassName,
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
      moduleId: command.options.moduleId ?? rootClassName,
      name: metadata?.rootApi.name ?? rootClassName,
      description: metadata?.rootApi.description ?? rootClassName,
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
          createRuntimeContextForModuleInstance(command.options.moduleId ?? rootClassName, moduleInstanceId),
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
      enrichRecoveryHints: buildClassModelEnrichRecoveryHints(metadata, command.options.enrichRecoveryHints),
    }
    return new AiAgentRegistration(registrationOptions)
  }
}

function buildClassModelEnrichRecoveryHints(
  metadata: AiModuleMetadataJson | undefined,
  enrichRecoveryHints?: (command: EnrichFunctionCallFailureCommand) => readonly string[],
): (command: EnrichFunctionCallFailureCommand) => readonly string[] {
  return command => {
    const hints = metadata === undefined
      ? []
      : collectClassModelFailureModeRecoveryHints(metadata, {
          callResult: {
            code: command.callResult.code,
            msg: command.callResult.msg,
          },
          ...(command.moduleInstanceId === undefined ? {} : { moduleInstanceId: command.moduleInstanceId }),
        })
    return enrichRecoveryHints === undefined ? hints : [...hints, ...enrichRecoveryHints(command)]
  }
}

type ClassModelAgentToolRuntimeOptions<T> = Readonly<{
  metadata?: AiModuleMetadataJson
  document?: ClassModelDocument
  rootClassName: string
  options: ClassModelAgentAdapterRegisterOptions<T>
  instance?: T
  moduleClass: ClassModelAgentAdapterConstructor<T>
}>

class ClassModelAgentToolRuntime<T> implements AiAgentToolRuntime {
  private readonly runtime: ClassModelRuntime

  public constructor(private readonly adapterOptions: ClassModelAgentToolRuntimeOptions<T>) {
    this.runtime = new ClassModelRuntime({
      ...(adapterOptions.document === undefined ? {} : { document: adapterOptions.document }),
      ...(adapterOptions.options.knowledge === undefined ? {} : { knowledge: adapterOptions.options.knowledge }),
      scriptExecutor: async command => {
        const host = readRuntimeHostContext(command.host)
        const instance = this.resolveInstance(toRuntimeContext(host))
        if (adapterOptions.metadata === undefined) {
          const manifestUrl = adapterOptions.options.dtsClassModelManifestUrl
          if (manifestUrl === undefined || manifestUrl.length === 0) {
            throw new Error('DTS-native script executor requires dtsClassModelManifestUrl.')
          }
          const result = await executeDtsNativeScript({
            instance,
            manifestUrl,
            rootClassName: adapterOptions.rootClassName,
            host,
            script: command.script,
          })
          return toClassModelToolResult(result)
        }
        const result = await executeAiNativeScript({
          instance,
          metadata: adapterOptions.metadata,
          host,
          ...(adapterOptions.options.jsonSchemaDefs === undefined
            ? {}
            : { schemaDefs: adapterOptions.options.jsonSchemaDefs }),
          script: command.script,
        })
        return toClassModelToolResult(result)
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
      promptSnapshot: this.adapterOptions.document === undefined
        ? createDtsNativePromptSnapshot(this.adapterOptions.rootClassName)
        : createClassModelPromptSnapshot(this.adapterOptions.document),
    }
  }

  public inspect(): AiAgentToolRuntimeInspectReport {
    if (this.adapterOptions.document === undefined) {
      return {
        status: 'ok',
        rootKinds: [this.adapterOptions.rootClassName],
        moduleCount: 1,
        findings: [],
      }
    }
    const findings = auditClassModelReflectionConnectivity(this.adapterOptions.document).map((issue: ClassModelReflectionConnectivityIssue) => ({
      level: issue.code === 'REFLECTION_KIND_UNREACHABLE_VIA_ATTRIBUTES' ? 'warn' as const : 'info' as const,
      code: issue.code,
      message: issue.message,
    }))
    return {
      status: findings.some(finding => finding.level === 'warn') ? 'warning' : 'ok',
      rootKinds: [this.adapterOptions.document.rootKind],
      moduleCount: this.adapterOptions.document.module.apiRegistry === undefined
        ? 1
        : Object.keys(this.adapterOptions.document.module.apiRegistry).length + 1,
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

function toClassModelToolResult(result: AiAgentToolResult<AiJsonValue>): ClassModelToolResult {
  return {
    ok: result.ok,
    ...(result.data === undefined ? {} : { data: result.data }),
    ...(result.checks === undefined ? {} : { checks: result.checks.map(toClassModelToolCheck) }),
    ...(result.state === undefined ? {} : { state: result.state }),
  }
}

function toClassModelToolCheck(check: AiAgentToolCheck): ClassModelToolCheck {
  return {
    level: check.level,
    code: check.code,
    message: check.message,
    ...(check.hint === undefined ? {} : { hint: check.hint }),
  }
}

function toAgentToolResult(result: ClassModelToolResult): AiAgentToolResult<AiJsonValue> {
  return new AiAgentToolResult({
    ok: result.ok,
    ...(result.data === undefined ? {} : { data: result.data }),
    ...(result.checks === undefined ? {} : { checks: result.checks.map(toAgentToolCheck) }),
    ...(result.state === undefined ? {} : { state: result.state }),
  })
}

function toAgentToolCheck(check: ClassModelToolCheck): AiAgentToolCheck {
  return new AiAgentToolCheck(
    check.level,
    check.code,
    check.message,
    check.hint,
  )
}

function toAgentToolSpec(tool: ClassModelToolSpec): AiAgentToolSpec {
  return {
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }
}

function createClassModelPromptSnapshot(document: ClassModelDocument): string {
  const kinds = listAttributeReachableKinds(document)
  return [
    'ClassModel 工具闭集：model_query, model_class_guide, model_attribute_guide, model_action_guide, model_script, human_question, agent_complete。',
    `根模型 kind="${document.rootKind}"；属性链可达模型（与 model_query 一致）: ${kinds.join(', ')}。`,
    'model_query 只列 attribute.api 属性链可达 kind；动作入口与 callback 契约用 model_action_guide（含 resultApis）。',
    '执行前先用 model_query 定位 kind/member；读写或调用前用 model_attribute_guide/model_action_guide 查看 schema、usageRules、failureModes。',
    '唯一执行入口是 model_script({ script })；script 是 async function body，this 绑定当前业务根实例，沿原生对象链调用。',
    '任务完成必须调用 agent_complete({ summary })；不要使用旧 module_* 工具、path 直调或 direct function tool。',
  ].join('\n')
}

function readRuntimeHostContext(value: unknown): AiAgentRuntimeHostContext {
  if (!isRuntimeHostContext(value)) {
    throw new Error('ClassModel script executor requires Agent host context.')
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

function createDtsNativePromptSnapshot(rootClassName: string): string {
  return [
    'ClassModel 工具闭集：model_query, model_class_guide, model_attribute_guide, model_action_guide, model_script, human_question, agent_complete。',
    `根模型 className="${rootClassName}"；知识来源为 generated/dts-class-model。`,
    '执行前先用 model_query 定位 kind/member；读写或调用前用 model_attribute_guide/model_action_guide 查看 schema。',
    '唯一执行入口是 model_script({ script })；script 是 async function body，this 绑定当前业务根实例，沿原生对象链调用。',
    '任务完成必须调用 agent_complete({ summary })；不要使用旧 module_* 工具、path 直调或 direct function tool。',
  ].join('\n')
}

function constructModuleInstance<T>(
  moduleClass: ClassModelAgentAdapterConstructor<T>,
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
  options: ClassModelAgentAdapterRegisterOptions<T>,
  instance: T | undefined,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  if (callback === undefined) return undefined
  if (instance !== undefined) return bindOptionalLifecycle(instance, callback)
  if (options.resolveInstance === undefined) return undefined
  return (...args: TArgs) => {
    const resolved = resolveLifecycleInstance(options, instance, readRuntimeContextFromLifecycleArgs(args))
    if (resolved === undefined) {
      throw new Error('ClassModelAgentAdapter lifecycle callback requires a resolvable module instance.')
    }
    return callback(resolved, ...args)
  }
}

function resolveLifecycleInstance<T>(
  options: ClassModelAgentAdapterRegisterOptions<T>,
  instance: T | undefined,
  context: AiAgentRuntimeContext,
): T | undefined {
  if (instance !== undefined) return instance
  if (options.resolveInstance === undefined) return undefined
  return options.resolveInstance(context)
}

function readRuntimeContextFromLifecycleArgs(args: readonly unknown[]): AiAgentRuntimeContext {
  const candidate = args[0]
  if (candidate instanceof AiAgentRuntimeContext) {
    return candidate
  }
  const contextFields = readRuntimeContextFields(candidate)
  if (contextFields !== null) {
    return new AiAgentRuntimeContext(
      contextFields.moduleId,
      contextFields.moduleInstanceId,
      contextFields.instanceId,
    )
  }
  throw new Error('ClassModelAgentAdapter lifecycle callback expected AiAgentRuntimeContext as the first argument.')
}

function readRuntimeContextFields(value: unknown): Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
}> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const moduleId = readReflectStringField(value, 'moduleId')
  const moduleInstanceId = readReflectStringField(value, 'moduleInstanceId')
  const instanceId = readReflectStringField(value, 'instanceId')
  if (moduleId === null || moduleInstanceId === null || instanceId === null) {
    return null
  }
  return { moduleId, moduleInstanceId, instanceId }
}

function readReflectStringField(value: object, key: string): string | null {
  const field: unknown = Reflect.get(value, key)
  return typeof field === 'string' ? field : null
}

function createRuntimeContextForModuleInstance(moduleId: string, moduleInstanceId: string): AiAgentRuntimeContext {
  return new AiAgentRuntimeContext(moduleId, moduleInstanceId, moduleInstanceId)
}
