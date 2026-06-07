import { readJsonProperty } from '@spark-appworks/spark-json-document'
import { AiJsonSchemaValidator, type AiJsonParams, type AiJsonSchemaValidateOptions } from '../../json'
import { AiModuleResult, type AiModulePathContext } from '../../modules'
import type { AiApiActionMetadata, AiApiObjectMetadata, AiApiResultApiRef } from '../../modules/metadata'

type MethodTarget = Readonly<Record<string, unknown>>
type ScriptCallable = (...args: readonly unknown[]) => unknown
type ApiMethod = (first: AiModulePathContext | AiJsonParams, second?: AiJsonParams) => unknown

type ApiProxyState = Readonly<{
  value: Promise<unknown>
  api: AiApiObjectMetadata
  resolved: ResolvedValue
}>

type ResolvedValue = {
  settled: boolean
  value?: unknown
}

export function createAiApiScriptContext(
  instance: unknown,
  api: AiApiObjectMetadata,
  ctx: AiModulePathContext,
): Readonly<Record<string, unknown>> {
  const proxy = createApiProxy(createApiProxyState(Promise.resolve(instance), api), ctx) as Readonly<Record<string, unknown>>
  const context: Record<string, unknown> = {}
  for (const action of api.actions) {
    context[action.name] = (...args: readonly unknown[]) => {
      const fn = proxy[action.name]
      if (!isScriptCallable(fn)) {
        throw new Error(`${api.kind}.${action.name} script proxy is not callable`)
      }
      return fn(...args)
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
  args: AiJsonParams | ((...params: readonly unknown[]) => unknown),
  ctx: AiModulePathContext,
  options: AiJsonSchemaValidateOptions = {},
): Promise<AiModuleResult<unknown>> {
  return await executeAiApiActionValue(target, action, args, ctx, options)
}

function executeAiApiActionValue(
  target: unknown,
  action: AiApiActionMetadata,
  args: AiJsonParams | ((...params: readonly unknown[]) => unknown),
  ctx: AiModulePathContext,
  options: AiJsonSchemaValidateOptions = {},
): AiModuleResult<unknown> | Promise<AiModuleResult<unknown>> {
  const normalizedArgs = normalizeScriptActionArgs(action, args)
  const validation = AiJsonSchemaValidator.validateDeserializedParams(normalizedArgs, action.paramsSchema, options)
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
  const raw = callApiMethod(method, target, action, ctx, normalizedArgs)
  if (isPromiseLike(raw)) {
    return Promise.resolve(raw).then(value => wrapRawActionResult(value))
  }
  return wrapRawActionResult(raw)
}

async function wrapAsyncApiActionValue(
  target: unknown,
  action: AiApiActionMetadata,
  args: AiJsonParams,
  ctx: AiModulePathContext,
): Promise<unknown> {
  return unwrapActionResult(action.name, await executeAiApiAction(target, action, args, ctx))
}

function wrapRawActionResult(raw: unknown): AiModuleResult<unknown> {
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

type ApiProxyOptions = Readonly<{
  /** true：可被 await；false：await 解包后的 facade，不再暴露 then 以免 Promise 递归采纳。 */
  awaitable: boolean
}>

function createApiProxy(state: ApiProxyState, ctx: AiModulePathContext): unknown {
  return createApiSurface(state, ctx, { awaitable: true })
}

function createApiProxyState(value: Promise<unknown>, api: AiApiObjectMetadata): ApiProxyState {
  const resolved: ResolvedValue = { settled: false }
  void value.then(target => {
    resolved.settled = true
    resolved.value = target
  })
  return { value, api, resolved }
}

function createApiSurface(
  state: ApiProxyState,
  ctx: AiModulePathContext,
  options: ApiProxyOptions,
): unknown {
  return new Proxy({}, {
    get(_target, property) {
      if (options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => state.value.then(
          target => onFulfilled?.(createResolvedApiSurface(target, state.api, ctx, { awaitable: false })),
          onRejected,
        )
      }
      if (options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => state.value.then(
          target => createResolvedApiSurface(target, state.api, ctx, { awaitable: false }),
        ).catch(onRejected)
      }
      if (options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => state.value.then(
          target => createResolvedApiSurface(target, state.api, ctx, { awaitable: false }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined

      const action = state.api.actions.find(candidate => candidate.name === property)
      if (action !== undefined) {
        return (...args: readonly unknown[]) => {
          const normalizedArgs = normalizeScriptActionArgList(action, args)
          if (state.resolved.settled) {
            return wrapResultApis(
              callApiActionInScriptValue(
                state.resolved.value,
                action,
                normalizedArgs,
                ctx,
              ),
              action.resultApis ?? [],
              ctx,
            )
          }
          return wrapResultApis(
            state.value.then(target => wrapAsyncApiActionValue(
            target,
            action,
            normalizedArgs,
            ctx,
            )),
            action.resultApis ?? [],
            ctx,
          )
        }
      }

      const propertyApi = resolvePropertyApi(state.api, property)
      if (state.resolved.settled) {
        const propertyValue = readJsonProperty(state.resolved.value, property)
        return propertyApi === undefined
          ? propertyValue
          : createResolvedApiSurface(propertyValue, propertyApi, ctx, options)
      }

      return createApiSurface(
        createApiProxyState(
          state.value.then(target => readJsonProperty(target, property)),
          propertyApi ?? state.api,
        ),
        ctx,
        options,
      )
    },
  })
}

function createResolvedApiSurface(
  target: unknown,
  api: AiApiObjectMetadata,
  ctx: AiModulePathContext,
  options: ApiProxyOptions,
): unknown {
  return new Proxy({}, {
    get(_target, property) {
      if (options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(target).then(
          () => onFulfilled?.(createResolvedApiSurface(target, api, ctx, { awaitable: false })),
          onRejected,
        )
      }
      if (options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(
          createResolvedApiSurface(target, api, ctx, { awaitable: false }),
        ).catch(onRejected)
      }
      if (options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => Promise.resolve(
          createResolvedApiSurface(target, api, ctx, { awaitable: false }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined

      const action = api.actions.find(candidate => candidate.name === property)
      if (action !== undefined) {
        return (...args: readonly unknown[]) => wrapResultApis(
          callApiActionInScriptValue(
            target,
            action,
            normalizeScriptActionArgList(action, args),
            ctx,
          ),
          action.resultApis ?? [],
          ctx,
        )
      }

      const propertyValue = readJsonProperty(target, property)
      const propertyApi = resolvePropertyApi(api, property)
      if (propertyApi !== undefined) {
        return createResolvedApiSurface(propertyValue, propertyApi, ctx, options)
      }
      return propertyValue
    },
  })
}

function callApiActionInScriptValue(
  target: unknown,
  action: AiApiActionMetadata,
  args: AiJsonParams,
  ctx: AiModulePathContext,
): unknown {
  const result = executeAiApiActionValue(target, action, args, ctx)
  if (isPromiseLike(result)) {
    return result.then(value => unwrapActionResult(action.name, value))
  }
  return unwrapActionResult(action.name, result)
}

function unwrapActionResult(actionName: string, result: AiModuleResult<unknown>): unknown {
  if (!result.ok) {
    throw new AiApiScriptActionFailure(actionName, result)
  }
  return result.data
}

function wrapResultApis(
  value: unknown,
  resultApis: readonly AiApiResultApiRef[],
  ctx: AiModulePathContext,
): unknown {
  if (resultApis.length === 0) return value
  if (!isPromiseLike(value)) {
    return createResolvedResultProxy(value, resultApis, [], ctx)
  }
  return createResultProxy(Promise.resolve(value), resultApis, [], ctx)
}

function createResolvedResultProxy(
  value: unknown,
  resultApis: readonly AiApiResultApiRef[],
  path: readonly string[],
  ctx: AiModulePathContext,
): unknown {
  return createResolvedResultPathSurface(value, resultApis, path, ctx, { awaitable: true })
}

function createResultProxy(
  value: Promise<unknown>,
  resultApis: readonly AiApiResultApiRef[],
  path: readonly string[],
  ctx: AiModulePathContext,
): unknown {
  return createResultPathSurface(value, resultApis, path, ctx, { awaitable: true })
}

function createResultPathSurface(
  value: Promise<unknown>,
  resultApis: readonly AiApiResultApiRef[],
  path: readonly string[],
  ctx: AiModulePathContext,
  options: ApiProxyOptions,
): unknown {
  const api = resultApis.find(ref => samePath(ref.resultPath, path))?.api
  if (api !== undefined) {
    return createApiSurface(createApiProxyState(value, api), ctx, options)
  }
  return new Proxy({}, {
    get(_target, property) {
      if (options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => value.then(
          target => onFulfilled?.(createResolvedResultPathSurface(target, resultApis, path, ctx, { awaitable: false })),
          onRejected,
        )
      }
      if (options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => value.then(
          target => createResolvedResultPathSurface(target, resultApis, path, ctx, { awaitable: false }),
        ).catch(onRejected)
      }
      if (options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => value.then(
          target => createResolvedResultPathSurface(target, resultApis, path, ctx, { awaitable: false }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined
      const nextPath = [...path, property]
      return createResultPathSurface(
        value.then(target => readJsonProperty(target, property)),
        resultApis,
        nextPath,
        ctx,
        options,
      )
    },
  })
}

function createResolvedResultPathSurface(
  value: unknown,
  resultApis: readonly AiApiResultApiRef[],
  path: readonly string[],
  ctx: AiModulePathContext,
  options: ApiProxyOptions,
): unknown {
  const api = resultApis.find(ref => samePath(ref.resultPath, path))?.api
  if (api !== undefined) {
    return createResolvedApiSurface(value, api, ctx, options)
  }
  return new Proxy({}, {
    get(_target, property) {
      if (options.awaitable && property === 'then') {
        return (onFulfilled?: ((value: unknown) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(value).then(
          () => onFulfilled?.(createResolvedResultPathSurface(value, resultApis, path, ctx, { awaitable: false })),
          onRejected,
        )
      }
      if (options.awaitable && property === 'catch') {
        return (onRejected?: ((reason: unknown) => unknown) | null) => Promise.resolve(
          createResolvedResultPathSurface(value, resultApis, path, ctx, { awaitable: false }),
        ).catch(onRejected)
      }
      if (options.awaitable && property === 'finally') {
        return (onFinally?: (() => void) | null) => Promise.resolve(
          createResolvedResultPathSurface(value, resultApis, path, ctx, { awaitable: false }),
        ).finally(onFinally)
      }
      if (property === 'then' || property === 'catch' || property === 'finally') {
        return undefined
      }
      if (typeof property !== 'string') return undefined
      const nextPath = [...path, property]
      return createResolvedResultPathSurface(
        readJsonProperty(value, property),
        resultApis,
        nextPath,
        ctx,
        options,
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

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as { then?: unknown }).then === 'function'
}

function callApiMethod(
  method: ApiMethod,
  target: MethodTarget,
  action: AiApiActionMetadata,
  ctx: AiModulePathContext,
  args: AiJsonParams,
): unknown {
  const mutatorRun = readMutatorRunArgument(action, args)
  if (mutatorRun !== undefined) {
    return Reflect.apply(method, target, [mutatorRun])
  }
  if (actionRequiresRun(action)) {
    const runValue = args['run']
    if (runValue !== undefined && typeof runValue !== 'function') {
      return AiModuleResult.failCode(
        'SCHEMA_VALIDATION_FAILED',
        `${action.name}.run must be a function, received ${typeof runValue}.`,
        '在 module_script 中使用 page.editDataSet(async ds => ...) / page.editNodeTree(async tree => ...)；勿把 createTable 参数对象当作 run。',
      )
    }
    return AiModuleResult.failCode(
      'SCHEMA_VALIDATION_FAILED',
      `${action.name} requires a callback argument; compatible { run } must be a function.`,
      '在 module_script 中使用 page.editDataSet(async ds => ...) / page.editNodeTree(async tree => ...)。',
    )
  }
  if (action.takesContext === true) return method.call(target, ctx, args)
  if (action.takesContext === false) return Reflect.apply(method, target, projectPositionalArgs(action, args))
  return method.length >= 2 ? method.call(target, ctx, args) : method.call(target, args)
}

function actionRequiresRun(action: AiApiActionMetadata): boolean {
  return action.paramsSchema.required?.includes('run') === true
    || action.paramsSchema.properties?.['run'] !== undefined
}

function readMutatorRunArgument(
  action: AiApiActionMetadata,
  args: AiJsonParams,
): ((...params: readonly unknown[]) => unknown) | undefined {
  if (!actionRequiresRun(action)) return undefined
  const runValue = args['run']
  return typeof runValue === 'function'
    ? runValue
    : undefined
}

function projectPositionalArgs(action: AiApiActionMetadata, args: AiJsonParams): readonly unknown[] {
  const properties = action.paramsSchema.properties
  if (properties === undefined) return []
  return Object.keys(properties).map(name => args[name])
}

function normalizeScriptActionArgList(
  action: AiApiActionMetadata,
  args: readonly unknown[],
): AiJsonParams {
  if (args.length === 0) return normalizeScriptActionArgs(action, {})
  if (args.length === 1) return normalizeScriptActionArgs(action, args[0])
  return normalizePositionalScriptArgs(action, args)
}

/** module_script 常把 mutator 回调和原生对象参数直接传入；这里归一化为 VCM paramsSchema。 */
function normalizeScriptActionArgs(
  action: AiApiActionMetadata,
  args: unknown,
): AiJsonParams {
  if (typeof args === 'function') {
    if (actionRequiresRun(action)) return { run: args } as unknown as AiJsonParams
    return {}
  }
  const paramNames = actionParamNames(action)
  const paramName = paramNames[0]
  if (paramName !== undefined && paramNames.length === 1 && shouldWrapSingleNativeArgument(action, args)) {
    return { [paramName]: args } as unknown as AiJsonParams
  }
  return isRecord(args) ? args as AiJsonParams : {}
}

function normalizePositionalScriptArgs(
  action: AiApiActionMetadata,
  args: readonly unknown[],
): AiJsonParams {
  const paramNames = actionParamNames(action)
  if (paramNames.length === 0) return {}
  const next: Record<string, unknown> = {}
  for (let index = 0; index < Math.min(args.length, paramNames.length); index += 1) {
    const paramName = paramNames[index]
    if (paramName !== undefined) next[paramName] = args[index]
  }
  return next as unknown as AiJsonParams
}

function shouldWrapSingleNativeArgument(action: AiApiActionMetadata, args: unknown): boolean {
  const paramNames = actionParamNames(action)
  const paramName = paramNames[0]
  if (paramName === undefined) return false
  if (actionRequiresRun(action) && paramNames.length === 1 && paramName === 'run') {
    return false
  }
  if (isRecord(args) && Object.prototype.hasOwnProperty.call(args, paramName)) return false
  const propertySchema = action.paramsSchema.properties?.[paramName]
  if (propertySchema === undefined) return false
  if (!isRecord(args)) return true
  return schemaAcceptsObject(propertySchema)
}

function schemaAcceptsObject(schema: unknown): boolean {
  if (schema === true) return true
  if (!isRecord(schema)) return false
  const type = schema['type']
  if (type === 'object') return true
  return Array.isArray(type) && type.includes('object')
}

function actionParamNames(action: AiApiActionMetadata): string[] {
  return Object.keys(action.paramsSchema.properties ?? {})
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}
