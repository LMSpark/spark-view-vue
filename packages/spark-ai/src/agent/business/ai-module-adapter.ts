/**
 * agent/business · VCM API 对象注册适配器
 *
 * VCM/LLM 语义：把普通业务 class + VCM 元数据桥接为 root AiModule。
 * 返回 API 对象只作为元数据暴露给指南，不在运行时合成 handle/子模块。@ai-visible
 */

import { coerceJsonValue } from '../../json'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  type AiModuleFunctionMetadata,
  type AiModuleAttributeMetadata,
  type AiModulePathContext,
} from '../../modules'
import {
  validateApiObjectMetadata,
  type AiApiActionMetadata,
  type AiApiAttributeMetadata,
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
import { createAiApiScriptContext, executeAiApiAction } from './ai-api-script-context'

type AiModuleAdapterConstructor<T> = new (...args: never[]) => T

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
  resolveInstance?: (context: AiModulePathContext) => T
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
  apiName: string
  apiDescription: string
  instance: object
  api: AiApiObjectMetadata
}>

export class AiModuleAdapter {
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

    assertResolvableInstanceOptions(command.options)
    const instance = command.options.resolveInstance === undefined
      ? command.options.instance ?? constructModuleInstance(command.moduleClass, command.options.constructArgs ?? [])
      : command.options.instance
    const adapter = new AiModuleAdapter()
    const runtime = new AiModuleRuntime()
    runtime.register(adapter.buildRootAiModule(
      command.metadata.rootApi,
      createInstanceResolver(command.moduleClass, command.options, instance),
    ))

    const systemPrompt = instance === undefined ? undefined : bindOptionalLifecycle(instance, command.options.systemPrompt)
    const beforeFunctionCall = instance === undefined ? undefined : bindOptionalLifecycle(instance, command.options.beforeFunctionCall)
    const afterFunctionCall = instance === undefined ? undefined : bindOptionalLifecycle(instance, command.options.afterFunctionCall)
    const onStartSession = instance === undefined ? undefined : bindOptionalLifecycle(instance, command.options.onStartSession)
    const registrationOptions: AiAgentRegistrationOptions = {
      moduleId: command.options.moduleId ?? command.metadata.rootApi.kind,
      name: command.metadata.rootApi.name,
      description: command.metadata.rootApi.description,
      runtime,
      sessionStore: command.options.sessionStore ?? new DefaultAiAgentSessionStore(),
      onEndBusinessInstance: async (context: AiAgentRuntimeContext, directive: AiAgentLifecycleDirective) => {
        if (instance !== undefined) {
          await command.options.onEndBusinessInstance?.(instance, context, directive)
        }
      },
      releaseModuleInstance: (moduleInstanceId: string) => {
        if (instance !== undefined) {
          command.options.releaseModuleInstance?.(instance, moduleInstanceId)
        }
      },
      ...(command.options.inputContract === undefined ? {} : { inputContract: command.options.inputContract }),
      ...(systemPrompt === undefined ? {} : { systemPrompt }),
      ...(beforeFunctionCall === undefined ? {} : { beforeFunctionCall }),
      ...(afterFunctionCall === undefined ? {} : { afterFunctionCall }),
      ...(onStartSession === undefined ? {} : { onStartSession }),
    }
    return new AiAgentRegistration(registrationOptions)
  }

  private buildRootAiModule<T>(
    api: AiApiObjectMetadata,
    resolveInstance: (ctx: AiModulePathContext) => T,
  ): AiModule {
    return new AiModule({
      kind: api.kind,
      name: api.name,
      description: api.description,
      ...(api.attributes === undefined ? {} : { attributes: api.attributes.map(toModuleAttributeMetadata) }),
      functions: api.actions.map(toModuleFunctionMetadata),
      find: () => AiModuleResult.ok([]),
      scriptContext: ctx => createAiApiScriptContext(resolveInstance(ctx), api, ctx),
      runner: async (ctx, functionName, args) => {
        const instance = resolveInstance(ctx)
        const action = api.actions.find(candidate => candidate.name === functionName)
        if (action === undefined) {
          return AiModuleResult.failCode(
            'FUNCTION_NOT_DECLARED',
            `${api.kind} 未声明函数 "${functionName}"`,
            '检查 VCM 元数据 actions 是否包含该 functionName。',
          )
        }
        const result = await executeAiApiAction(instance, action, args, ctx)
        if (!result.ok) return AiModuleResult.passthroughFailure(result)
        const data = coerceJsonValue(result.data)
        return AiModuleResult.ok(data === undefined ? null : data)
      },
    })
  }
}

function toModuleAttributeMetadata(attribute: AiApiAttributeMetadata): AiModuleAttributeMetadata {
  return {
    name: attribute.name,
    description: attribute.description,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
  }
}

function assertResolvableInstanceOptions<T>(options: AiModuleAdapterRegisterOptions<T>): void {
  const hasLifecycle = options.systemPrompt !== undefined
    || options.beforeFunctionCall !== undefined
    || options.afterFunctionCall !== undefined
    || options.onStartSession !== undefined
    || options.onEndBusinessInstance !== undefined
    || options.releaseModuleInstance !== undefined
  if (options.resolveInstance !== undefined && options.instance === undefined && hasLifecycle) {
    throw new Error('AiModuleAdapter resolveInstance requires options.instance when instance-bound lifecycle callbacks are provided.')
  }
}

function createInstanceResolver<T>(
  moduleClass: AiModuleAdapterConstructor<T>,
  options: AiModuleAdapterRegisterOptions<T>,
  instance: T | undefined,
): (ctx: AiModulePathContext) => T {
  if (options.resolveInstance !== undefined) return options.resolveInstance
  if (instance !== undefined) return () => instance
  return () => constructModuleInstance(moduleClass, options.constructArgs ?? [])
}

function constructModuleInstance<T>(
  moduleClass: AiModuleAdapterConstructor<T>,
  args: readonly unknown[],
): T {
  const construct = moduleClass as unknown as new (...args: unknown[]) => T
  return new construct(...args)
}

function toModuleFunctionMetadata(action: AiApiActionMetadata): AiModuleFunctionMetadata {
  return {
    name: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.resultApis === undefined ? {} : { resultApis: action.resultApis.map(toModuleFunctionResultApiMetadata) }),
    ...(action.usageRules === undefined ? {} : { usageRules: [...action.usageRules] }),
    ...(action.failureModes === undefined ? {} : { failureModes: action.failureModes.map(mode => ({ ...mode })) }),
  }
}

function toModuleFunctionResultApiMetadata(ref: AiApiResultApiRef): NonNullable<AiModuleFunctionMetadata['resultApis']>[number] {
  return {
    resultPath: [...ref.resultPath],
    kind: ref.api.kind,
    name: ref.api.name,
    description: ref.api.description,
    actions: ref.api.actions.map(action => ({
      name: action.name,
      description: action.description,
      paramNames: isIndexableObject(action.paramsSchema.properties) ? Object.keys(action.paramsSchema.properties) : [],
    })),
  }
}

function isIndexableObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object'
}

function bindOptionalLifecycle<T, TArgs extends readonly unknown[], TResult>(
  instance: T,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  return callback === undefined ? undefined : (...args) => callback(instance, ...args)
}
