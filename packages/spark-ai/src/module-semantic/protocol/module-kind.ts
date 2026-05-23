/**
 * ModuleKind 是 module-semantic 协议核心。
 *
 * 单一职责：
 * - 声明元数据：attributes / actions / payloads / children。
 * - 承载运行时委托：attributeAccessor / actionRunner / childLister / instanceFinder。
 * - 在协议入口做 fail-fast、JSON Schema 校验和 JSON 值规整。
 */

import {
  LlmSchemaValidator,
  type LlmJsonObject,
  type LlmJsonSchema,
  type LlmJsonSchemaObject,
  type LlmJsonValue,
  type LlmParamValidationIssue,
} from '../../schema'
import type {
  ModuleChildrenLister,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOperation,
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

export type ModuleParameterPayloadMetadata = Readonly<{
  payloadRef: string
  description: string
  requiredForActions?: readonly string[] | undefined
}>

export type ModuleAttributeAccessor = Readonly<{
  get: (ctx: ModulePathContext, attrName: string) => ModuleKindOperation<unknown>
  set: (ctx: ModulePathContext, attrName: string, value: LlmJsonValue) => ModuleKindOperation<void>
}>

export type ModuleKindOptions = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string | undefined
  attributes?: readonly ModuleAttributeMetadata[] | undefined
  actions?: readonly ModuleActionMetadata[] | undefined
  payloads?: readonly ModuleParameterPayloadMetadata[] | undefined
  children?: readonly string[] | undefined
  attributeAccessor?: ModuleAttributeAccessor | undefined
  runner?: ModuleKindRunner | undefined
  list?: ModuleChildrenLister | undefined
  find?: ModuleInstanceFinder | undefined
}>

type ModuleActionServiceResult =
  | { readonly ok: true; readonly data?: unknown; readonly summary?: string | undefined }
  | { readonly ok: false; readonly code: string; readonly msg: string; readonly fix?: string | undefined }

const EMPTY_ATTRIBUTE_ACCESSOR: ModuleAttributeAccessor = {
  get: () => ModuleOperationResult.failCode(
    'ATTRIBUTE_ACCESSOR_NOT_REGISTERED',
    'ModuleKind 未注册属性访问委托',
    '声明 attributes 时必须在 ModuleKind 构造期提供 attributeAccessor。',
  ),
  set: () => ModuleOperationResult.failCode(
    'ATTRIBUTE_ACCESSOR_NOT_REGISTERED',
    'ModuleKind 未注册属性访问委托',
    '声明 attributes 时必须在 ModuleKind 构造期提供 attributeAccessor。',
  ),
}

export class ModuleKind {
  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly parentKind?: string | undefined
  public readonly attributes: readonly ModuleAttributeMetadata[]
  public readonly actions: readonly ModuleActionMetadata[]
  public readonly payloads: readonly ModuleParameterPayloadMetadata[]
  public readonly children: readonly string[]

  private readonly moduleAttributeByName: ReadonlyMap<string, ModuleAttributeMetadata>
  private readonly moduleActionByName: ReadonlyMap<string, ModuleActionMetadata>
  private readonly actionRunner: ModuleKindRunner
  private readonly attributeAccessor: ModuleAttributeAccessor
  private readonly childLister: ModuleChildrenLister
  private readonly instanceFinder: ModuleInstanceFinder

  public constructor(options: ModuleKindOptions) {
    const kind = normalizeRequiredText(options.kind, 'kind')
    this.kind = kind
    this.name = normalizeRequiredText(options.name, `name for "${kind}"`)
    this.description = normalizeRequiredText(options.description, `description for "${kind}"`)
    this.parentKind = normalizeParentKind(options.parentKind, kind)
    this.attributes = normalizeAttributeMetadata(options.attributes ?? [], kind)
    this.moduleAttributeByName = createNamedMap(this.attributes, 'attribute')
    this.actions = normalizeActionMetadata(options.actions ?? [], kind)
    this.moduleActionByName = createNamedMap(this.actions, 'action')
    this.payloads = normalizePayloadMetadata(options.payloads ?? [], kind)
    this.children = normalizeChildKinds(options.children ?? [], kind)

    if (this.attributes.length > 0 && options.attributeAccessor === undefined) {
      throw new Error(`attributeAccessor for "${kind}" is required when attributes are declared`)
    }

    this.attributeAccessor = options.attributeAccessor ?? EMPTY_ATTRIBUTE_ACCESSOR
    this.actionRunner = options.runner ?? ((_ctx, actionName) => actionNotImplemented(this.kind, actionName))
    this.childLister = options.list ?? (() => ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([]))
    this.instanceFinder = options.find ?? ((ctx, childKind) => {
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

  public async getAttribute(
    ctx: ModulePathContext,
    attrName: string,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return attributeNotDeclared(this.kind, attrName)
    }
    if (!attr.readable) {
      return attributeNotReadable(this.kind, attrName)
    }

    try {
      const result = await this.attributeAccessor.get(ctx, attrName)
      if (!result.ok) {
        return ModuleOperationResult.passthroughFailure(result)
      }
      if (result.data === undefined) {
        return ModuleOperationResult.failCode(
          'ATTRIBUTE_VALUE_NOT_FOUND',
          `${this.kind} 属性 "${attrName}" 未设置`,
          '请确认 ModuleKind 构造期 attributeAccessor 能返回该属性值。',
        )
      }

      const value = ModuleKind.coerceJsonValue(result.data)
      if (value === undefined) {
        return ModuleOperationResult.failCode(
          'ATTRIBUTE_VALUE_NOT_JSON',
          `${this.kind} 属性 "${attrName}" 不是可序列化 JSON 值`,
          '请把属性值保持为字符串、数字、布尔、null、数组或普通对象。',
        )
      }

      const validation = LlmSchemaValidator.validateJsonValue(value, attr.schema)
      if (!validation.ok) {
        return schemaValidationFailed(
          `${this.kind}.${attrName} 属性值`,
          validation.issues,
          '请按该属性在 describeKind 中声明的 schema 修正属性值。',
        )
      }
      return ModuleOperationResult.ok(value)
    } catch (error) {
      return attributeReadFailed(this.kind, attrName, error)
    }
  }

  public async setAttribute(
    ctx: ModulePathContext,
    attrName: string,
    value: LlmJsonValue,
  ): Promise<ModuleOperationResult<void>> {
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return attributeNotDeclared(this.kind, attrName)
    }
    if (!attr.writable) {
      return attributeNotWritable(this.kind, attrName)
    }

    const validation = LlmSchemaValidator.validateJsonValue(value, attr.schema)
    if (!validation.ok) {
      return schemaValidationFailed(
        `${this.kind}.${attrName} 属性写入值`,
        validation.issues,
        '请按该属性在 describeKind 中声明的 schema 修正 value。',
      )
    }

    try {
      const result = await this.attributeAccessor.set(ctx, attrName, value)
      if (!result.ok) {
        return ModuleOperationResult.passthroughFailure(result)
      }
      return ModuleOperationResult.ok<void>()
    } catch (error) {
      return attributeWriteFailed(this.kind, attrName, error)
    }
  }

  public async invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const action = this.findAction(actionName)
    if (action === undefined) {
      return actionNotDeclared(this.kind, actionName)
    }

    const validation = LlmSchemaValidator.validateLlmDeserializedParams(args, action.paramsSchema)
    if (!validation.ok) {
      return schemaValidationFailed(
        `${this.kind}.${actionName} 参数`,
        validation.issues,
        '请按该 action 在 describeKind 中声明的 paramsSchema 调整参数后重试。',
      )
    }

    try {
      return await this.runAction(ctx, actionName, args)
    } catch (error) {
      return actionExecuteError(error)
    }
  }

  protected runAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): ModuleKindOperation<LlmJsonValue> {
    return this.actionRunner(ctx, actionName, args)
  }

  public listChildren(
    ctx: ModulePathContext,
    childKind?: string,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.childLister(ctx, childKind))
  }

  public findInstance(
    ctx: ModulePathContext,
    childKind: string,
    query: ModuleInstanceQuery,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.instanceFinder(ctx, childKind, query))
  }

  public async resolveChild(
    ctx: ModulePathContext,
    childKind: string,
    childId: string,
  ): Promise<ModuleOperationResult<boolean>> {
    if (!this.children.includes(childKind)) {
      return ModuleOperationResult.ok(false)
    }

    const found = await this.findInstance(ctx, childKind, { id: childId })
    if (!found.ok) {
      return ModuleOperationResult.passthroughFailure(found)
    }
    return ModuleOperationResult.ok((found.data ?? []).some((ref) => ref.id === childId))
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
    return ModuleKind.coerceJsonValueInternal(value, new WeakSet<object>())
  }

  private static coerceJsonValueInternal(value: unknown, seen: WeakSet<object>): LlmJsonValue | undefined {
    if (value === null) return null
    if (value === undefined) return undefined
    if (typeof value === 'string') return value
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (typeof value === 'boolean') return value
    if (typeof value === 'bigint') return value.toString()
    if (typeof value === 'symbol') return value.toString()
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value.toISOString() : undefined
    }
    if (value instanceof URL) {
      return value.toString()
    }
    if (value instanceof ArrayBuffer) {
      return Array.from(new Uint8Array(value))
    }
    if (ArrayBuffer.isView(value)) {
      return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) return undefined
      seen.add(value)
      const out: LlmJsonValue[] = []
      for (const item of value) {
        const coerced = ModuleKind.coerceJsonValueInternal(item, seen)
        if (coerced !== undefined) out.push(coerced)
      }
      seen.delete(value)
      return out
    }
    if (value instanceof Set) {
      if (seen.has(value)) return undefined
      seen.add(value)
      const out: LlmJsonValue[] = []
      for (const item of value) {
        const coerced = ModuleKind.coerceJsonValueInternal(item, seen)
        if (coerced !== undefined) out.push(coerced)
      }
      seen.delete(value)
      return out
    }
    if (value instanceof Map) {
      if (seen.has(value)) return undefined
      seen.add(value)
      const out: Record<string, LlmJsonValue> = {}
      for (const [key, item] of value.entries()) {
        const coerced = ModuleKind.coerceJsonValueInternal(item, seen)
        if (coerced !== undefined) out[String(key)] = coerced
      }
      seen.delete(value)
      return out
    }
    if (typeof value === 'object') {
      if (seen.has(value)) return undefined
      seen.add(value)
      const obj: Record<string, LlmJsonValue> = {}
      for (const [key, raw] of Object.entries(value)) {
        const coerced = ModuleKind.coerceJsonValueInternal(raw, seen)
        if (coerced !== undefined) obj[key] = coerced
      }
      seen.delete(value)
      return obj
    }
    return undefined
  }
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`)
  }
  return normalized
}

function normalizeAttributeMetadata(
  attributes: readonly ModuleAttributeMetadata[],
  ownKind: string,
): readonly ModuleAttributeMetadata[] {
  return attributes.map((attribute) => ({
    name: normalizeRequiredText(attribute.name, `attribute name for "${ownKind}"`),
    description: normalizeRequiredText(attribute.description, `attribute "${attribute.name}" description for "${ownKind}"`),
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    ...(attribute.example === undefined ? {} : { example: attribute.example }),
  }))
}

function normalizeActionMetadata(
  actions: readonly ModuleActionMetadata[],
  ownKind: string,
): readonly ModuleActionMetadata[] {
  return actions.map((action) => ({
    name: normalizeRequiredText(action.name, `action name for "${ownKind}"`),
    description: normalizeRequiredText(action.description, `action "${action.name}" description for "${ownKind}"`),
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.usageRules === undefined ? {} : { usageRules: [...action.usageRules] }),
    ...(action.failureModes === undefined
      ? {}
      : { failureModes: action.failureModes.map((mode) => ({ ...mode })) }),
    ...(action.example === undefined ? {} : { example: action.example }),
  }))
}

function normalizePayloadMetadata(
  payloads: readonly ModuleParameterPayloadMetadata[],
  ownKind: string,
): readonly ModuleParameterPayloadMetadata[] {
  const seen = new Set<string>()
  const out: ModuleParameterPayloadMetadata[] = []
  for (const payload of payloads) {
    const payloadRef = normalizeRequiredText(payload.payloadRef, `payloadRef for "${ownKind}"`)
    if (seen.has(payloadRef)) {
      throw new Error(`duplicate payloadRef "${payloadRef}" on "${ownKind}"`)
    }
    const description = normalizeRequiredText(payload.description, `payloadRef "${payloadRef}" description for "${ownKind}"`)
    const requiredForActions = normalizePayloadActionNames(payload.requiredForActions ?? [], ownKind, payloadRef)
    seen.add(payloadRef)
    out.push({
      payloadRef,
      description,
      ...(requiredForActions.length === 0 ? {} : { requiredForActions }),
    })
  }
  return out
}

function normalizePayloadActionNames(
  actionNames: readonly string[],
  ownKind: string,
  payloadRef: string,
): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const actionName of actionNames) {
    const normalized = normalizeRequiredText(actionName, `payload action for "${payloadRef}" on "${ownKind}"`)
    if (seen.has(normalized)) {
      throw new Error(`duplicate payload action "${normalized}" for "${payloadRef}" on "${ownKind}"`)
    }
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function normalizeParentKind(parentKind: string | undefined, ownKind: string): string | undefined {
  if (parentKind === undefined) return undefined
  const normalized = normalizeRequiredText(parentKind, `parentKind for "${ownKind}"`)
  if (normalized === ownKind) {
    throw new Error(`parentKind for "${ownKind}" must not point to itself`)
  }
  return normalized
}

function normalizeChildKinds(children: readonly string[], ownKind: string): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const child of children) {
    const normalized = normalizeRequiredText(child, `child kind for "${ownKind}"`)
    if (normalized === ownKind) {
      throw new Error(`child kind for "${ownKind}" must not point to itself`)
    }
    if (seen.has(normalized)) {
      throw new Error(`duplicate child kind "${normalized}" on "${ownKind}"`)
    }
    seen.add(normalized)
    out.push(normalized)
  }
  return out
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

function schemaValidationFailed(
  subject: string,
  issues: readonly LlmParamValidationIssue[],
  hint: string,
): ModuleOperationResult<never> {
  const summary = ModuleCheckEntry.error(
    'SCHEMA_VALIDATION_FAILED',
    `${subject} JSON Schema 校验失败: ${LlmSchemaValidator.formatLlmParamValidationIssues(issues)}`,
    hint,
  )
  const details = issues.map((issue) =>
    ModuleCheckEntry.error('SCHEMA_VALIDATION_FAILED', `${issue.path} ${issue.message}`, hint),
  )
  return ModuleOperationResult.fail([summary, ...details])
}

function actionNotImplemented(kind: string, actionName: string): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'ACTION_NOT_IMPLEMENTED',
    `${kind} 未注册动作 "${actionName}"`,
    '请检查该 ModuleKind 构造期 action 委托是否实现了该 actionName。',
  )
}

function actionNotDeclared(kind: string, actionName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ACTION_NOT_DECLARED',
    `kind "${kind}" 未声明动作 "${actionName}"`,
    '可调用 describeKind 查看该 kind 的动作表。',
  )
}

function attributeNotDeclared(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_DECLARED',
    `kind "${kind}" 未声明属性 "${attrName}"`,
    '可调用 describeKind 查看该 kind 的属性表。',
  )
}

function attributeNotReadable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_READABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可读`,
    '请只读取 readable=true 的属性；可调用 describeKind 查看属性权限。',
  )
}

function attributeNotWritable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_WRITABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可写`,
    '请只写入 writable=true 的属性；可调用 describeKind 查看属性权限。',
  )
}

function attributeReadFailed(kind: string, attrName: string, error: unknown): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_READ_FAILED',
    error instanceof Error ? error.message : `${kind} 属性 "${attrName}" 读取失败`,
    '检查 ModuleKind 构造期 attributeAccessor.get 实现。',
  )
}

function attributeWriteFailed(kind: string, attrName: string, error: unknown): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_WRITE_FAILED',
    error instanceof Error ? error.message : `${kind} 属性 "${attrName}" 写入失败`,
    '检查 ModuleKind 构造期 attributeAccessor.set 实现。',
  )
}

function actionExecuteError(error: unknown): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'ACTION_EXECUTE_ERROR',
    error instanceof Error ? error.message : String(error),
    '检查动作 runner 实现；业务可捕获异常后返回更具体的 OperationResult。',
  )
}
