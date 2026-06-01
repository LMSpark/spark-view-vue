/**
 * agent/business · VCM API 对象注册适配器
 *
 * VCM/LLM 语义：把普通业务 class + VCM 元数据桥接为 root AiModule，并把 action
 * 返回的 API-bearing 对象登记为 handle，供 module_handle_call 后续调用。@ai-visible
 */

import {
  AiJsonSchemaValidator,
  coerceJsonValue,
  type AiJsonParams,
  type AiJsonValue,
} from '../../json'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleFunctionMetadata,
  type AiModulePathContext,
  type AiModuleToolSpec,
} from '../../modules'
import {
  validateApiObjectMetadata,
  type AiApiActionMetadata,
  type AiApiObjectMetadata,
  type AiApiResultApiRef,
  type AiModuleMetadataJson,
} from '../../modules/metadata'
import { DefaultAiAgentSessionStore } from '../session/default-session-store'
import type { AiAgentSessionStore } from '../session/session-types'
import type {
  AiAgentAfterFunctionCallOptions,
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentLifecycleDirective,
} from './lifecycle-types'
import type { AiAgentHost } from './ai-host'
import type { AiAgentInputContract } from './business-task'
import { AiAgentRegistration, type AiAgentRegistrationOptions } from './registration-types'
import type { AiAgentRuntimeContext } from './scope-types'

type AiModuleAdapterConstructor<T> = new (...args: readonly unknown[]) => T

export type AiModuleAdapterRegisterCommand<T> = Readonly<{
  host: AiAgentHost
  alias: string
  moduleClass: AiModuleAdapterConstructor<T>
  metadata: AiModuleMetadataJson
  options: AiModuleAdapterRegisterOptions<T>
}>

export type AiModuleAdapterRegistrationCommand<T> = Readonly<{
  moduleClass: AiModuleAdapterConstructor<T>
  metadata: AiModuleMetadataJson
  options: AiModuleAdapterRegisterOptions<T>
}>

export type AiModuleAdapterRegisterOptions<T> = Readonly<{
  moduleId?: string
  instance?: T
  constructArgs?: readonly unknown[]
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
}>

export type AiApiObjectHandle = Readonly<{
  handleId: string
  apiKind: string
  instance: object
  actions: readonly AiApiActionMetadata[]
  businessInstanceId: string
}>

type AiApiObjectHandleEntry = Omit<AiApiObjectHandle, 'handleId' | 'businessInstanceId'>

type HandleEnvelope = Readonly<{
  value: AiJsonValue | null
  _handles: ReadonlyArray<Readonly<{ handleId: string; apiKind: string }>>
}>

type CallableMethod = (target: unknown, ctx: AiModulePathContext, args: AiJsonParams) => unknown

export class AiModuleHandleRegistry {
  private readonly handlesByInstance = new Map<string, Map<string, AiApiObjectHandle>>()
  private handleCounter = 0

  public register(businessInstanceId: string, entry: AiApiObjectHandleEntry): string {
    const handleId = `hnd_${String(++this.handleCounter)}`
    const handle: AiApiObjectHandle = { ...entry, handleId, businessInstanceId }
    let instanceMap = this.handlesByInstance.get(businessInstanceId)
    if (instanceMap === undefined) {
      instanceMap = new Map()
      this.handlesByInstance.set(businessInstanceId, instanceMap)
    }
    instanceMap.set(handleId, handle)
    return handleId
  }

  public get(businessInstanceId: string, handleId: string): AiApiObjectHandle | undefined {
    return this.handlesByInstance.get(businessInstanceId)?.get(handleId)
  }

  public clearForInstance(businessInstanceId: string): void {
    this.handlesByInstance.delete(businessInstanceId)
  }
}

type HandleDispatchCommand = Readonly<{
  businessInstanceId: string
  handleId: string
  actionName: string
  args: AiJsonParams
  ctx: AiModulePathContext
}>

export class AiModuleAdapter {
  private readonly handleRegistry = new AiModuleHandleRegistry()

  public static register<T>(command: AiModuleAdapterRegisterCommand<T>): AiAgentHost {
    const registration = AiModuleAdapter.createRegistration({
      moduleClass: command.moduleClass,
      metadata: command.metadata,
      options: command.options,
    })
    return command.host.register(command.alias, registration)
  }

  public static createRegistration<T>(command: AiModuleAdapterRegistrationCommand<T>): AiAgentRegistration {
    validateApiObjectMetadata(command.metadata.rootApi)

    const instance = command.options.instance
      ?? new command.moduleClass(...(command.options.constructArgs ?? []))
    const adapter = new AiModuleAdapter()
    const runtime = new AiModuleRuntime({
      handleCallTool: adapter.createHandleCallToolSpec(command.metadata.rootApi),
      handleToolDispatcher: adapter,
    })
    runtime.register(adapter.buildRootAiModule(command.metadata.rootApi, instance))

    const systemPrompt = bindOptionalLifecycle(instance, command.options.systemPrompt)
    const beforeFunctionCall = bindOptionalLifecycle(instance, command.options.beforeFunctionCall)
    const afterFunctionCall = bindOptionalLifecycle(instance, command.options.afterFunctionCall)
    const onStartSession = bindOptionalLifecycle(instance, command.options.onStartSession)
    const registrationOptions: AiAgentRegistrationOptions = {
      moduleId: command.options.moduleId ?? command.metadata.rootApi.kind,
      name: command.metadata.rootApi.name,
      description: command.metadata.rootApi.description,
      runtime,
      sessionStore: command.options.sessionStore ?? new DefaultAiAgentSessionStore(),
      onEndBusinessInstance: async (context: AiAgentRuntimeContext, directive: AiAgentLifecycleDirective) => {
        adapter.handleRegistry.clearForInstance(context.moduleInstanceId)
        await command.options.onEndBusinessInstance?.(instance, context, directive)
      },
      releaseModuleInstance: (moduleInstanceId: string) => {
        adapter.handleRegistry.clearForInstance(moduleInstanceId)
        command.options.releaseModuleInstance?.(instance, moduleInstanceId)
      },
      ...(command.options.inputContract === undefined ? {} : { inputContract: command.options.inputContract }),
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
      ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      ...(afterFunctionCall === undefined ? {} : { afterFunctionCall }),
      ...(onStartSession === undefined ? {} : { onStartSession }),
    }
    return new AiAgentRegistration(registrationOptions)
  }

  public async dispatchHandle(command: HandleDispatchCommand): Promise<AiModuleResult<AiJsonValue>> {
    const handle = this.handleRegistry.get(command.businessInstanceId, command.handleId)
    if (handle === undefined) {
      return AiModuleResult.failCode(
        'HANDLE_NOT_FOUND',
        `handle "${command.handleId}" 不存在或已过期`,
        '重新调用创建该 handle 的 action，获取新的 handle。',
      )
    }
    const action = handle.actions.find(candidate => candidate.name === command.actionName)
    if (action === undefined) {
      return AiModuleResult.failCode(
        'HANDLE_ACTION_NOT_FOUND',
        `handle "${command.handleId}" (${handle.apiKind}) 没有 action "${command.actionName}"`,
        `可用 actions: ${handle.actions.map(candidate => candidate.name).join(', ')}`,
      )
    }
    const validation = AiJsonSchemaValidator.validateDeserializedParams(command.args, action.paramsSchema)
    if (!validation.ok) {
      return AiModuleResult.failCode(
        'INVALID_PARAMS',
        `action "${command.actionName}" 参数校验失败: ${AiJsonSchemaValidator.formatAiJsonValidationIssues(validation.issues)}`,
        `期望 schema: ${JSON.stringify(action.paramsSchema)}`,
      )
    }
    const method = readCallableMethod(handle.instance, action.methodName)
    if (method === undefined) {
      return functionNotImplemented(handle.apiKind, action.methodName)
    }
    const result = await readModuleResult(method(handle.instance, command.ctx, command.args), handle.apiKind, action.methodName)
    return this.attachHandles(command.businessInstanceId, action.resultApis ?? [], result)
  }

  private buildRootAiModule<T>(api: AiApiObjectMetadata, instance: T): AiModule {
    return new AiModule({
      kind: api.kind,
      name: api.name,
      description: api.description,
      functions: api.actions.map(toModuleFunctionMetadata),
      find: (ctx, childKind) => {
        if (childKind !== api.kind) return AiModuleResult.ok([])
        const instanceId = ctx.host?.moduleInstanceId
        if (instanceId === undefined || instanceId.length === 0) return AiModuleResult.ok([])
        return AiModuleResult.ok([{ id: instanceId, label: `当前 ${api.name}`, summary: api.description }])
      },
      runner: async (ctx, functionName, args) => {
        const action = api.actions.find(candidate => candidate.name === functionName)
        if (action === undefined) {
          return AiModuleResult.failCode(
            'FUNCTION_NOT_DECLARED',
            `${api.kind} 未声明函数 "${functionName}"`,
            '检查 VCM 元数据 actions 是否包含该 functionName。',
          )
        }
        const methodName = action.methodName
        const method = readCallableMethod(instance, methodName)
        if (method === undefined) {
          return functionNotImplemented(api.kind, methodName)
        }
        const result = await readModuleResult(method(instance, ctx, args), api.kind, methodName)
        const businessInstanceId = readBusinessInstanceId(ctx)
        if (businessInstanceId === undefined && (action.resultApis ?? []).length > 0) {
          return AiModuleResult.failCode(
            'HANDLE_SCOPE_NOT_FOUND',
            '无法创建 API 对象 handle：当前调用缺少 business instance 标识',
            'Host 层执行工具时必须注入 ctx.host.moduleInstanceId。',
          )
        }
        return this.attachHandles(businessInstanceId ?? '', action.resultApis ?? [], result)
      },
    })
  }

  private createHandleCallToolSpec(rootApi: AiApiObjectMetadata): AiModuleToolSpec {
    const allHandleActions = collectHandleActionLabels(rootApi)
    return {
      type: 'function',
      function: {
        name: 'module_handle_call',
        description: [
          'Call an action on an API object handle returned in a previous _handles payload.',
          allHandleActions.length === 0 ? 'No handle actions are currently declared.' : `Available handle actions: ${allHandleActions.join(', ')}.`,
        ].join('\n'),
        parameters: {
          type: 'object',
          properties: {
            handleId: { type: 'string', description: 'Handle ID from a previous _handles item.' },
            actionName: { type: 'string', description: 'Action name declared on the handle API object.' },
            args: { type: 'object', description: 'Action arguments matching the handle action paramsSchema.' },
          },
          required: ['handleId', 'actionName'],
          additionalProperties: false,
        },
      },
    }
  }

  private attachHandles(
    businessInstanceId: string,
    refs: readonly AiApiResultApiRef[],
    result: AiModuleResult<unknown>,
  ): AiModuleResult<AiJsonValue> {
    if (!result.ok) return AiModuleResult.passthroughFailure(result)
    if (refs.length === 0) {
      const data = coerceJsonValue(result.data)
      return AiModuleResult.ok(data === undefined ? null : data)
    }
    const handles: Array<{ handleId: string; apiKind: string }> = []
    for (const ref of refs) {
      const nestedInstance = extractByPath(result.data, ref.resultPath)
      if (!isObjectInstance(nestedInstance)) continue
      const handleId = this.handleRegistry.register(businessInstanceId, {
        apiKind: ref.api.kind,
        instance: nestedInstance,
        actions: ref.api.actions,
      })
      handles.push({ handleId, apiKind: ref.api.kind })
    }
    if (handles.length === 0) {
      const data = coerceJsonValue(result.data)
      return AiModuleResult.ok(data === undefined ? null : data)
    }
    return AiModuleResult.ok(toHandleEnvelope(result.data, handles))
  }
}

function toModuleFunctionMetadata(action: AiApiActionMetadata): AiModuleFunctionMetadata {
  return {
    name: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.usageRules === undefined ? {} : { usageRules: [...action.usageRules] }),
    ...(action.failureModes === undefined ? {} : { failureModes: action.failureModes.map(mode => ({ ...mode })) }),
  }
}

function toHandleEnvelope(
  value: unknown,
  handles: ReadonlyArray<Readonly<{ handleId: string; apiKind: string }>>,
): HandleEnvelope {
  return {
    value: coerceJsonValue(value) ?? null,
    _handles: handles,
  }
}

function extractByPath(data: unknown, path: readonly string[]): unknown {
  let current = data
  for (const key of path) {
    if (!isIndexableObject(current)) return undefined
    current = current[key]
  }
  return current
}

function collectHandleActionLabels(api: AiApiObjectMetadata): readonly string[] {
  const labels: string[] = []
  for (const action of api.actions) {
    for (const ref of action.resultApis ?? []) {
      labels.push(...ref.api.actions.map(handleAction => `${ref.api.kind}.${handleAction.name}`))
    }
  }
  return labels
}

function readBusinessInstanceId(ctx: AiModulePathContext): string | undefined {
  const value = ctx.host?.moduleInstanceId
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function readCallableMethod(target: unknown, methodName: string): CallableMethod | undefined {
  if (!hasCallableProperty(target, methodName)) return undefined
  return (methodTarget, ctx, args) => {
    if (!hasCallableProperty(methodTarget, methodName)) return undefined
    return methodTarget[methodName]?.(ctx, args)
  }
}

function functionNotImplemented(kind: string, methodName: string): AiModuleResult<never> {
  return AiModuleResult.failCode(
    'FUNCTION_NOT_IMPLEMENTED',
    `${kind} 未实现方法 "${methodName}"`,
    '检查业务 class 是否实现了 VCM 元数据声明的 methodName。',
  )
}

function isObjectInstance(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}

function hasCallableProperty(
  value: unknown,
  methodName: string,
): value is Readonly<Record<string, (ctx: AiModulePathContext, args: AiJsonParams) => unknown>> {
  return isIndexableObject(value) && typeof value[methodName] === 'function'
}

async function readModuleResult(
  value: unknown,
  kind: string,
  methodName: string,
): Promise<AiModuleResult<unknown>> {
  const resolved = await value
  if (resolved instanceof AiModuleResult) return resolved
  return AiModuleResult.failCode(
    'INVALID_ACTION_RESULT',
    `${kind}.${methodName} 必须返回 AiModuleResult`,
    '检查业务方法签名，不要返回普通对象或 undefined。',
  )
}

function bindOptionalLifecycle<T, TArgs extends readonly unknown[], TResult>(
  instance: T,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  return callback === undefined ? undefined : (...args) => callback(instance, ...args)
}
