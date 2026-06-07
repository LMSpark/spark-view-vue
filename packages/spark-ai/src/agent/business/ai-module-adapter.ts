/**
 * agent/business · VCM API 对象注册适配器
 *
 * VCM/LLM 语义：把普通业务 class + VCM 元数据桥接为 root AiModule。
 * 返回 API 对象只作为元数据暴露给指南，不在运行时合成 handle/子模块。@ai-visible
 */

import type { AiJsonSchemaValidateOptions } from '../../json'
import { coerceJsonValue } from '../../json'
import {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
  mergeCompanionChildDeclarations,
  type AiModuleFunctionMetadata,
  type AiModulePathContext,
} from '../../modules'
import {
  collectNestedApiRecords,
  validateApiObjectMetadata,
  resolveModuleMetadataJson,
  toModuleAttributeMetadata,
  toModuleFunctionMetadata,
  type AiApiObjectMetadata,
  type AiApiActionMetadata,
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
import { AiAgentRuntimeContext } from './scope-types'
import { createAiApiScriptContext, executeAiApiAction } from '../native-runtime/native-script-context'

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
  /** 模块 metadata 文档级 $defs；运行时 paramsSchema $ref 由 AJV 2020 解析。 */
  jsonSchemaDefs?: Readonly<Record<string, unknown>>
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
    const metadata = resolveModuleMetadataJson(command.metadata)
    validateApiObjectMetadata(metadata.rootApi)

    const instance = command.options.resolveInstance === undefined
      ? command.options.instance ?? constructModuleInstance(command.moduleClass, command.options.constructArgs ?? [])
      : command.options.instance
    const adapter = new AiModuleAdapter()
    const runtime = new AiModuleRuntime()
    const rootModule = adapter.buildRootAiModule(
      metadata.rootApi,
      createInstanceResolver(command.moduleClass, command.options, instance),
      command.options.jsonSchemaDefs,
    )
    const vcmGuideModules = adapter.buildVcmGuideModules(metadata.rootApi)
    const registeredModules = assembleRegisteredModules({
      rootModule,
      vcmGuideModules,
    })
    const wiredModules = registeredModules.length === 1
      ? registeredModules
      : mergeCompanionChildDeclarations(registeredModules)
    for (const moduleKind of wiredModules) {
      runtime.register(moduleKind)
    }

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
    }
    return new AiAgentRegistration(registrationOptions)
  }

  private buildRootAiModule<T>(
    api: AiApiObjectMetadata,
    resolveInstance: (ctx: AiModulePathContext) => T,
    jsonSchemaDefs?: Readonly<Record<string, unknown>>,
  ): AiModule {
    const schemaValidateOptions: AiJsonSchemaValidateOptions =
      jsonSchemaDefs === undefined || Object.keys(jsonSchemaDefs).length === 0
        ? {}
        : { schemaDefs: jsonSchemaDefs as NonNullable<AiJsonSchemaValidateOptions['schemaDefs']> }
    return new AiModule({
      kind: api.kind,
      name: api.name,
      description: api.description,
      ...(api.constructorSignature === undefined ? {} : { constructorSignature: api.constructorSignature }),
      ...(api.attributes === undefined ? {} : { attributes: api.attributes.map(toModuleAttributeMetadata) }),
      functions: api.actions.map(action => toModuleFunctionMetadata(action, { directCallable: false })),
      scriptContext: ctx => createAiApiScriptContext(resolveInstance(ctx), api, ctx, schemaValidateOptions),
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
        const result = await executeAiApiAction(instance, action, args, ctx, schemaValidateOptions)
        if (!result.ok) return AiModuleResult.passthroughFailure(result)
        const data = coerceJsonValue(result.data)
        return AiModuleResult.ok(data === undefined ? null : data)
      },
    })
  }

  private buildVcmGuideModules(rootApi: AiApiObjectMetadata): readonly AiModule[] {
    return collectNestedApiRecords(rootApi).map(record => buildVcmGuideModule(record.api, record.parentKind))
  }
}

function buildVcmGuideModule(api: AiApiObjectMetadata, parentKind: string): AiModule {
  return new AiModule({
    kind: api.kind,
    name: api.name,
    description: api.description,
    parentKind,
    ...(api.constructorSignature === undefined ? {} : { constructorSignature: api.constructorSignature }),
    ...(api.attributes === undefined ? {} : { attributes: api.attributes.map(toModuleAttributeMetadata) }),
    functions: api.actions.map(toVcmGuideFunctionMetadata),
    runner: (_ctx, functionName) => AiModuleResult.failCode(
      'VCM_RESULT_API_DIRECT_CALL_NOT_SUPPORTED',
      `${api.kind}.${functionName} 是 VCM 返回对象 API 指南，不能通过实例 path 直接调用。`,
      `先用 module_function_guide({ kind: "${api.kind}", functionName: "${functionName}" }) 查看参数；执行修改时在 module_script 中沿原生对象链式调用。`,
    ),
  })
}

function toVcmGuideFunctionMetadata(action: AiApiActionMetadata): AiModuleFunctionMetadata {
  const base = toModuleFunctionMetadata(action, { directCallable: false })
  const scriptRule = '该函数属于 VCM 返回对象 API：执行时通过 module_script 的原生对象链式调用，不使用 /kind[id] 实例 path 直调。'
  const usageRules = [...(base.usageRules ?? [])]
  if (!usageRules.includes(scriptRule)) {
    usageRules.push(scriptRule)
  }
  return {
    ...base,
    usageRules,
  }
}

type RegisteredModuleSource = 'root' | 'vcm-guide'

type AssembleRegisteredModulesOptions = Readonly<{
  rootModule: AiModule
  vcmGuideModules: readonly AiModule[]
}>

function assembleRegisteredModules(options: AssembleRegisteredModulesOptions): readonly AiModule[] {
  const sources = new Map<string, RegisteredModuleSource>()
  const out: AiModule[] = []

  const register = (moduleKind: AiModule, source: RegisteredModuleSource): void => {
    const existing = sources.get(moduleKind.kind)
    if (existing !== undefined) {
      throw new Error(
        `AiModuleAdapter: duplicate kind "${moduleKind.kind}" (${existing} vs ${source}). `
        + 'Business API kinds must come from VCM metadata only.',
      )
    }
    sources.set(moduleKind.kind, source)
    out.push(moduleKind)
  }

  register(options.rootModule, 'root')
  for (const moduleKind of options.vcmGuideModules) {
    register(moduleKind, 'vcm-guide')
  }
  return out
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

function bindOptionalLifecycle<T, TArgs extends readonly unknown[], TResult>(
  instance: T,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  return callback === undefined ? undefined : (...args) => callback(instance, ...args)
}

function bindInstanceLifecycle<T, TArgs extends readonly unknown[], TResult>(
  options: AiModuleAdapterRegisterOptions<T>,
  instance: T | undefined,
  callback: ((instance: T, ...args: TArgs) => TResult) | undefined,
): ((...args: TArgs) => TResult) | undefined {
  if (callback === undefined) return undefined
  if (instance !== undefined) return bindOptionalLifecycle(instance, callback)
  if (options.resolveInstance === undefined) return undefined
  return (...args: TArgs) => {
    const resolved = resolveLifecycleInstance(options, instance, readRuntimeContextFromLifecycleArgs(args))
    if (resolved === undefined) {
      throw new Error('AiModuleAdapter lifecycle callback requires a resolvable module instance.')
    }
    return callback(resolved, ...args)
  }
}

function resolveLifecycleInstance<T>(
  options: AiModuleAdapterRegisterOptions<T>,
  instance: T | undefined,
  context: AiAgentRuntimeContext,
): T | undefined {
  if (instance !== undefined) return instance
  if (options.resolveInstance === undefined) return undefined
  return options.resolveInstance(runtimeContextToModulePathContext(context))
}

function readRuntimeContextFromLifecycleArgs(args: readonly unknown[]): AiAgentRuntimeContext {
  const candidate = args[0]
  if (!isRuntimeContextLike(candidate)) {
    throw new Error('AiModuleAdapter lifecycle callback expected AiAgentRuntimeContext as the first argument.')
  }
  return candidate
}

function isRuntimeContextLike(value: unknown): value is AiAgentRuntimeContext {
  return value !== null
    && typeof value === 'object'
    && typeof Reflect.get(value, 'moduleId') === 'string'
    && typeof Reflect.get(value, 'moduleInstanceId') === 'string'
    && typeof Reflect.get(value, 'instanceId') === 'string'
}

function runtimeContextToModulePathContext(context: AiAgentRuntimeContext): AiModulePathContext {
  return {
    segments: [],
    host: {
      moduleId: context.moduleId,
      moduleInstanceId: context.moduleInstanceId,
      instanceId: context.instanceId,
    },
  }
}

function createRuntimeContextForModuleInstance(moduleId: string, moduleInstanceId: string): AiAgentRuntimeContext {
  return new AiAgentRuntimeContext(moduleId, moduleInstanceId, moduleInstanceId)
}
