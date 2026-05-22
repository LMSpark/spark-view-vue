/**
 * Module semantic kind core.
 *
 * ModuleKind owns metadata plus runner/list/find delegates. Path, operation
 * result, and context primitives live in adjacent protocol files so the public
 * API has one name per concept instead of a giant namespace.
 */

import type { LlmJsonObject, LlmJsonSchema, LlmJsonSchemaObject, LlmJsonValue } from '../../schema'
import type {
  ModuleChildrenLister,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindRunner,
  ModulePathContext,
} from './module-context'
import { ModuleCheckEntry, ModuleOperationResult } from './module-operation'

export type ModuleAttributeMetadata = Readonly<{
  name: string
  description: string
  schema: LlmJsonSchema
  readable: boolean
  writable: boolean
  example?: LlmJsonValue | undefined
}>

export type ModuleAttributeAccess = Pick<ModuleAttributeMetadata, 'readable' | 'writable'>

export type ModuleActionFailureMode = Readonly<{
  code: string
  when: string
  fix: string
}>

export type ModuleActionResultSchema = LlmJsonSchema | LlmJsonObject

export type ModuleActionMetadata = Readonly<{
  name: string
  description: string
  paramsSchema: LlmJsonSchemaObject
  resultSchema?: ModuleActionResultSchema | undefined
  usageRules?: readonly string[] | undefined
  failureModes?: readonly ModuleActionFailureMode[] | undefined
  example?: LlmJsonValue | undefined
}>

export type ModuleKindOptions = Readonly<{
  kind: string
  name: string
  description: string
  attributes?: readonly ModuleAttributeMetadata[] | undefined
  actions?: readonly ModuleActionMetadata[] | undefined
  children?: readonly string[] | undefined
  runner?: ModuleKindRunner | undefined
  list?: ModuleChildrenLister | undefined
  find?: ModuleInstanceFinder | undefined
}>

type ModuleKindRunnerProperties = Record<string, unknown>

const EMPTY_RUNNER_PROPERTIES: ModuleKindRunnerProperties = {}

type ModuleActionServiceResult =
  | { readonly ok: true; readonly data?: unknown; readonly summary?: string | undefined }
  | { readonly ok: false; readonly code: string; readonly msg: string; readonly fix?: string | undefined }

export class ModuleKind {
  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly attributes: readonly ModuleAttributeMetadata[]
  public readonly actions: readonly ModuleActionMetadata[]
  public readonly children: readonly string[]

  private readonly moduleAttributeByName: ReadonlyMap<string, ModuleAttributeMetadata>
  private readonly moduleActionByName: ReadonlyMap<string, ModuleActionMetadata>

  public runner: ModuleKindRunner
  public list: ModuleChildrenLister
  public find: ModuleInstanceFinder

  public constructor(options: ModuleKindOptions) {
    this.kind = options.kind
    this.name = options.name
    this.description = options.description
    this.attributes = normalizeAttributeMetadata(options.attributes ?? [])
    this.moduleAttributeByName = createNamedMap(this.attributes, 'attribute')
    this.actions = normalizeActionMetadata(options.actions ?? [])
    this.moduleActionByName = createNamedMap(this.actions, 'action')
    this.children = options.children ?? []

    this.runner = options.runner ?? ((_ctx, actionName) => actionNotImplemented(this.kind, actionName))
    this.list = options.list ?? (() => ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([]))
    this.find = options.find ?? ((ctx, childKind) => {
      if (childKind !== this.kind || ctx.segments.length !== 0) {
        return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([])
      }
      const ref = this.createCurrentInstanceRef(ctx)
      return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>(ref === null ? [] : [ref])
    })
  }

  public findAttribute(attrName: string): ModuleAttributeMetadata | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  public findAction(actionName: string): ModuleActionMetadata | undefined {
    return this.moduleActionByName.get(actionName)
  }

  public getAttribute(
    _ctx: ModulePathContext,
    attrName: string,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return Promise.resolve(attributeNotDeclared(this.kind, attrName))
    }
    if (!attr.readable) {
      return Promise.resolve(attributeNotReadable(this.kind, attrName))
    }

    const rawValue = runnerProperties(this.runner)[attrName]
    if (rawValue === undefined) {
      return Promise.resolve(ModuleOperationResult.failCode(
        'ATTRIBUTE_VALUE_NOT_FOUND',
        `${this.kind}.runner 未设置属性 "${attrName}"`,
        '请确认 ModuleKind.runner 函数对象上已设置该属性。',
      ))
    }

    const value = ModuleKind.coerceJsonValue(rawValue)
    if (value === undefined) {
      return Promise.resolve(ModuleOperationResult.failCode(
        'ATTRIBUTE_VALUE_NOT_JSON',
        `${this.kind}.runner 属性 "${attrName}" 不是可序列化 JSON 值`,
        '请把 runner 属性值保持为字符串、数字、布尔、null、数组或普通对象。',
      ))
    }
    return Promise.resolve(ModuleOperationResult.ok(value))
  }

  public setAttribute(
    _ctx: ModulePathContext,
    attrName: string,
    value: LlmJsonValue,
  ): Promise<ModuleOperationResult<void>> {
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return Promise.resolve(attributeNotDeclared(this.kind, attrName))
    }
    if (!attr.writable) {
      return Promise.resolve(attributeNotWritable(this.kind, attrName))
    }

    try {
      runnerProperties(this.runner)[attrName] = value
    } catch {
      return Promise.resolve(ModuleOperationResult.failCode(
        'ATTRIBUTE_WRITE_FAILED',
        `${this.kind}.runner 属性 "${attrName}" 写入失败`,
        '请确认 runner 函数对象允许写入该属性。',
      ))
    }
    return Promise.resolve(ModuleOperationResult.ok<void>())
  }

  public async invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    try {
      return await this.runner(ctx, actionName, args)
    } catch (error) {
      return actionExecuteError(error)
    }
  }

  public listChildren(
    ctx: ModulePathContext,
    childKind?: string,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.list(ctx, childKind))
  }

  public findInstance(
    ctx: ModulePathContext,
    childKind: string,
    query: ModuleInstanceQuery,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.find(ctx, childKind, query))
  }

  public resolveChild(
    ctx: ModulePathContext,
    childKind: string,
    childId: string,
  ): Promise<ModuleOperationResult<boolean>> {
    return this.resolve(ctx, childKind, childId)
  }

  protected createCurrentInstanceRef(ctx: ModulePathContext): ModuleInstanceRef | null {
    const instanceId = ctx.host?.moduleInstanceId
    if (instanceId === undefined || instanceId.length === 0) {
      return null
    }
    return {
      id: instanceId,
      label: `当前 ${this.kind} 实例`,
      summary: '当前 Host 业务实例',
    }
  }

  protected okJson(data?: unknown, checks?: readonly ModuleCheckEntry[]): ModuleOperationResult<LlmJsonValue> {
    const json = ModuleKind.coerceJsonValue(data)
    return ModuleOperationResult.ok(json, checks)
  }

  protected failJson(code: string, message: string, hint?: string): ModuleOperationResult<LlmJsonValue> {
    return ModuleOperationResult.failCode(code, message, hint)
  }

  protected serviceResultToOperationResult(result: ModuleActionServiceResult): ModuleOperationResult<LlmJsonValue> {
    if (result.ok) {
      return this.okJson(
        result.data,
        result.summary === undefined ? undefined : [ModuleCheckEntry.info('OK', result.summary)],
      )
    }
    return this.failJson(result.code, result.msg, result.fix)
  }

  public static coerceJsonValue(value: unknown): LlmJsonValue | undefined {
    if (value === null) return null
    if (value === undefined) return undefined
    if (typeof value === 'string') return value
    if (typeof value === 'number') return value
    if (typeof value === 'boolean') return value
    if (Array.isArray(value)) {
      const out: LlmJsonValue[] = []
      for (const item of value) {
        const coerced = ModuleKind.coerceJsonValue(item)
        if (coerced !== undefined) out.push(coerced)
      }
      return out
    }
    if (value instanceof Set) {
      return [...value].map((item) => ModuleKind.coerceJsonValue(item)).filter((item): item is LlmJsonValue => item !== undefined)
    }
    if (value instanceof Map) {
      const out: Record<string, LlmJsonValue> = {}
      for (const [key, item] of value.entries()) {
        const coerced = ModuleKind.coerceJsonValue(item)
        if (coerced !== undefined) out[String(key)] = coerced
      }
      return out
    }
    if (typeof value === 'object') {
      const obj: Record<string, LlmJsonValue> = {}
      for (const [key, raw] of Object.entries(value)) {
        const coerced = ModuleKind.coerceJsonValue(raw)
        if (coerced !== undefined) obj[key] = coerced
      }
      return obj
    }
    return undefined
  }

  private async resolve(
    ctx: ModulePathContext,
    childKind: string,
    childId: string,
  ): Promise<ModuleOperationResult<boolean>> {
    if (!this.children.includes(childKind)) {
      return ModuleOperationResult.ok(false)
    }

    const found = await this.find(ctx, childKind, { id: childId })
    if (!found.ok) {
      return ModuleOperationResult.passthroughFailure(found)
    }
    if ((found.data ?? []).some((ref) => ref.id === childId)) {
      return ModuleOperationResult.ok(true)
    }

    const listed = await this.list(ctx, childKind)
    if (!listed.ok) {
      return ModuleOperationResult.passthroughFailure(listed)
    }
    return ModuleOperationResult.ok((listed.data ?? []).some((ref) => ref.id === childId))
  }
}

function normalizeAttributeMetadata(attributes: readonly ModuleAttributeMetadata[]): readonly ModuleAttributeMetadata[] {
  return attributes.map((attribute) => ({
    name: attribute.name,
    description: attribute.description,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    ...(attribute.example === undefined ? {} : { example: attribute.example }),
  }))
}

function normalizeActionMetadata(actions: readonly ModuleActionMetadata[]): readonly ModuleActionMetadata[] {
  return actions.map((action) => ({
    name: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.usageRules === undefined ? {} : { usageRules: [...action.usageRules] }),
    ...(action.failureModes === undefined
      ? {}
      : { failureModes: action.failureModes.map((mode) => ({ ...mode })) }),
    ...(action.example === undefined ? {} : { example: action.example }),
  }))
}

function createNamedMap<TSchema extends { readonly name: string }>(
  schemas: readonly TSchema[],
  schemaType: string,
): ReadonlyMap<string, TSchema> {
  const out = new Map<string, TSchema>()
  for (const schema of schemas) {
    if (out.has(schema.name)) {
      throw new Error(`duplicate ${schemaType} schema "${schema.name}"`)
    }
    out.set(schema.name, schema)
  }
  return out
}

function runnerProperties(runner: ModuleKindRunner): ModuleKindRunnerProperties {
  return Object.assign(runner, EMPTY_RUNNER_PROPERTIES)
}

function actionNotImplemented(kind: string, actionName: string): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'ACTION_NOT_IMPLEMENTED',
    `${kind} 未注册动作 "${actionName}"`,
    '请检查该 ModuleKind.runner 是否实现了该 actionName。',
  )
}

function attributeNotDeclared(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_DECLARED',
    `kind "${kind}" 未声明属性 "${attrName}"`,
    '可调用 describeKind 查看该 kind 的属性表',
  )
}

function attributeNotReadable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_READABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可读`,
  )
}

function attributeNotWritable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_WRITABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可写`,
  )
}

function actionExecuteError(error: unknown): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'ACTION_EXECUTE_ERROR',
    error instanceof Error ? error.message : String(error),
    '检查动作 runner 实现；业务可捕获异常后返回更具体的 OperationResult。',
  )
}
