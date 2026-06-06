import { readJsonProperty } from '@spark-appworks/spark-json-document'
import { AiJsonSchemaValidator, type AiJsonParams, type AiJsonSchemaValidateOptions } from '../../json'
import { AiModuleResult, type AiModulePathContext } from '../../modules'
import type { AiApiActionMetadata, AiApiObjectMetadata, AiApiResultApiRef } from '../../modules/metadata'

type MethodTarget = Readonly<Record<string, unknown>>
type ScriptCallable = (args?: AiJsonParams) => unknown
type ApiMethod = (first: AiModulePathContext | AiJsonParams, second?: AiJsonParams) => unknown

type ApiProxyState = Readonly<{
  value: Promise<unknown>
  api: AiApiObjectMetadata
}>

export function createAiApiScriptContext(
  instance: unknown,
  api: AiApiObjectMetadata,
  ctx: AiModulePathContext,
): Readonly<Record<string, unknown>> {
  const proxy = createApiProxy({ value: Promise.resolve(instance), api }, ctx) as Readonly<Record<string, unknown>>
  const context: Record<string, unknown> = {}
  for (const action of api.actions) {
    context[action.name] = (args: AiJsonParams = {}) => {
      const fn = proxy[action.name]
      if (!isScriptCallable(fn)) {
        throw new Error(`${api.kind}.${action.name} script proxy is not callable`)
      }
      return fn(args)
    }
  }
  for (const attribute of api.attributes ?? []) {
    Object.defineProperty(context, attribute.name, {
      enumerable: true,
      get: () => proxy[attribute.name],
    })
  }
  return context
}

export async function executeAiApiAction(
  target: unknown,
  action: AiApiActionMetadata,
  args: AiJsonParams,
  ctx: AiModulePathContext,
  options: AiJsonSchemaValidateOptions = {},
): Promise<AiModuleResult<unknown>> {
  const validation = AiJsonSchemaValidator.validateDeserializedParams(args, action.paramsSchema, options)
  if (!validation.ok) {
    return AiModuleResult.failCode(
      'SCHEMA_VALIDATION_FAILED',
      `${action.name} 参数不符合 paramsSchema: ${validation.issues.map(issue => issue.message).join('; ')}`,
      '先读取 module_function_guide 或脚本上下文对应方法的 paramsSchema，再按 schema 修正参数。',
    )
  }
  if (!isMethodTarget(target)) {
    return AiModuleResult.failCode(
      'FUNCTION_NOT_IMPLEMENTED',
      `${action.name} 未实现方法 "${action.methodName}"`,
      '检查业务 class 是否实现了 VCM 元数据声明的 methodName。',
    )
  }
  const method = target[action.methodName]
  if (!isApiMethod(method)) {
    return AiModuleResult.failCode(
      'FUNCTION_NOT_IMPLEMENTED',
      `${action.name} 未实现方法 "${action.methodName}"`,
      '检查业务 class 是否实现了 VCM 元数据声明的 methodName。',
    )
  }
  const raw = await callApiMethod(method, target, action, ctx, args)
  if (raw instanceof AiModuleResult) return raw
  return AiModuleResult.ok(raw)
}

export class AiApiScriptActionFailure extends Error {
  public constructor(
    public readonly actionName: string,
    public readonly result: AiModuleResult<unknown>,
  ) {
    const first = result.checks?.[0]
    super(first === undefined ? `${actionName} failed` : `${first.code}: ${first.message}`)
  }
}

function createApiProxy(state: ApiProxyState, ctx: AiModulePathContext): unknown {
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return state.value.then.bind(state.value)
      }
      if (property === 'catch') {
        return state.value.catch.bind(state.value)
      }
      if (property === 'finally') {
        return state.value.finally.bind(state.value)
      }
      if (typeof property !== 'string') return undefined

      const action = state.api.actions.find(candidate => candidate.name === property)
      if (action !== undefined) {
        return (args: AiJsonParams = {}) => wrapResultApis(
          state.value.then(target => callApiActionInScript(target, action, args, ctx)),
          action.resultApis ?? [],
          ctx,
        )
      }

      return createApiProxy({
        value: state.value.then(target => readJsonProperty(target, property)),
        api: resolvePropertyApi(state.api, property) ?? state.api,
      }, ctx)
    },
  })
}

async function callApiActionInScript(
  target: unknown,
  action: AiApiActionMetadata,
  args: AiJsonParams,
  ctx: AiModulePathContext,
): Promise<unknown> {
  const result = await executeAiApiAction(target, action, args, ctx)
  if (!result.ok) {
    throw new AiApiScriptActionFailure(action.name, result)
  }
  return result.data
}

function wrapResultApis(
  value: unknown,
  resultApis: readonly AiApiResultApiRef[],
  ctx: AiModulePathContext,
): unknown {
  if (resultApis.length === 0) return value
  return createResultProxy(Promise.resolve(value), resultApis, [], ctx)
}

function createResultProxy(
  value: Promise<unknown>,
  resultApis: readonly AiApiResultApiRef[],
  path: readonly string[],
  ctx: AiModulePathContext,
): unknown {
  const api = resultApis.find(ref => samePath(ref.resultPath, path))?.api
  if (api !== undefined) {
    return createApiProxy({ value, api }, ctx)
  }
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'then') return value.then.bind(value)
      if (property === 'catch') return value.catch.bind(value)
      if (property === 'finally') return value.finally.bind(value)
      if (typeof property !== 'string') return undefined
      const nextPath = [...path, property]
      return createResultProxy(
        value.then(target => readJsonProperty(target, property)),
        resultApis,
        nextPath,
        ctx,
      )
    },
  })
}

function resolvePropertyApi(api: AiApiObjectMetadata, property: string): AiApiObjectMetadata | undefined {
  const attributeApi = api.attributes?.find(attribute => attribute.name === property)?.api
  if (attributeApi !== undefined) return attributeApi
  for (const action of api.actions) {
    const found = action.resultApis?.find(ref => ref.resultPath.length === 1 && ref.resultPath[0] === property)
    if (found !== undefined) return found.api
  }
  return undefined
}

function isMethodTarget(value: unknown): value is MethodTarget {
  return value !== null && typeof value === 'object'
}

function isScriptCallable(value: unknown): value is ScriptCallable {
  return typeof value === 'function'
}

function isApiMethod(value: unknown): value is ApiMethod {
  return typeof value === 'function'
}

function callApiMethod(
  method: ApiMethod,
  target: MethodTarget,
  action: AiApiActionMetadata,
  ctx: AiModulePathContext,
  args: AiJsonParams,
): unknown {
  if (action.takesContext === true) return method.call(target, ctx, args)
  if (action.takesContext === false) return Reflect.apply(method, target, projectPositionalArgs(action, args))
  return method.length >= 2 ? method.call(target, ctx, args) : method.call(target, args)
}

function projectPositionalArgs(action: AiApiActionMetadata, args: AiJsonParams): readonly unknown[] {
  const properties = action.paramsSchema.properties
  if (properties === undefined) return []
  return Object.keys(properties).map(name => args[name])
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}
