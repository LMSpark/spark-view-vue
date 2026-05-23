/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 模块类型核心                                               │
 * │  Module Kind — Protocol Core                                                  │
 * │                                                                              │
 * │  ModuleKind 是 module-semantic 协议的中心抽象。每个 ModuleKind 实例描述一个    │
 * │  业务能力模块的元数据（属性、动作、子模块）和运行时行为委托。                 │
 * │                                                                              │
 * │  三大职责：                                                                   │
 * │    1. 元数据声明 — attributes（属性表）、actions（动作表）、children（子模块） │
 * │    2. 运行时委托 — actionRunner、childLister、instanceFinder                 │
 * │    3. 属性访问   — getAttribute / setAttribute（按 attributes 元数据校验）     │
 * │                                                                              │
 * │  委托模式：                                                                   │
 * │    · actionRunner(ctx, actionName, args)  — 动作执行，可在函数对象上挂载属性   │
 * │    · childLister(ctx, childKind?)         — 列出子实例                         │
 * │    · instanceFinder(ctx, childKind, query) — 按条件查询子实例                  │
 * │    · 未提供时使用默认实现（空列表 / 自引用 / 未实现错误）                        │
 * │                                                                              │
 * │  子实例解析：resolveChild() 先查 find 再查 list，用于验证路径段的父子关系。     │
 * └─────────────────────────────────────────────────────────────────────────────┘
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

/* -------------------------------------------------------------------------------
 * 一、元数据类型
 * ----------------------------------------------------------------------------- */

/** 属性元数据：描述 ModuleKind 暴露给 LLM 的一个可读写属性 */
export type ModuleAttributeMetadata = Readonly<{
  name: string
  description: string
  /** 属性值的 JSON Schema（用于 LLM 校验） */
  schema: LlmJsonSchema
  readable: boolean
  writable: boolean
  /** 示例值（可选的，帮助 LLM 理解属性形状） */
  example?: LlmJsonValue | undefined
}>

/** 属性访问权限（从 ModuleAttributeMetadata 中提取的可读/可写标记） */
export type ModuleAttributeAccess = Pick<ModuleAttributeMetadata, 'readable' | 'writable'>

/** 动作失败模式：描述某个 action 可能出现的错误及修复建议 */
export type ModuleActionFailureMode = Readonly<{
  code: string
  when: string
  fix: string
}>

/** 动作结果 schema（支持简单类型或完整 JSON Schema） */
export type ModuleActionResultSchema = LlmJsonSchema | LlmJsonObject

/** 动作元数据：描述 ModuleKind 暴露给 LLM 的一个可调用动作 */
export type ModuleActionMetadata = Readonly<{
  name: string
  description: string
  /** 参数 schema（JSON Schema object root，用于 LLM 参数校验） */
  paramsSchema: LlmJsonSchemaObject
  /** 返回值 schema（可选，帮助 LLM 理解返回值结构） */
  resultSchema?: ModuleActionResultSchema | undefined
  /** 使用规则（多条，LLM 在调用前阅读） */
  usageRules?: readonly string[] | undefined
  /** 失败模式（多条，LLM 在调用失败后参考修复） */
  failureModes?: readonly ModuleActionFailureMode[] | undefined
  /** 调用示例（帮助 LLM 理解参数形状） */
  example?: LlmJsonValue | undefined
}>

/** 模块参数荷载元数据：描述某个 ModuleKind 依赖的外部参数指南 provider */
export type ModuleParameterPayloadMetadata = Readonly<{
  /** provider 唯一命名空间，例如 spark.component。 */
  payloadRef: string
  /** 该 payload 与当前模块的关系说明。 */
  description: string
  /** 该 payload 通常服务的 action 名；为空表示模块级通用。 */
  requiredForActions?: readonly string[] | undefined
}>

/* -------------------------------------------------------------------------------
 * 二、构造选项
 * ----------------------------------------------------------------------------- */

export type ModuleKindOptions = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string | undefined
  attributes?: readonly ModuleAttributeMetadata[] | undefined
  actions?: readonly ModuleActionMetadata[] | undefined
  payloads?: readonly ModuleParameterPayloadMetadata[] | undefined
  children?: readonly string[] | undefined
  runner?: ModuleKindRunner | undefined
  list?: ModuleChildrenLister | undefined
  find?: ModuleInstanceFinder | undefined
}>

/* -------------------------------------------------------------------------------
 * 三、内部类型与常量
 * ----------------------------------------------------------------------------- */

/** 业务动作的返回值（serviceResultToOperationResult 的输入格式） */
type ModuleActionServiceResult =
  | { readonly ok: true; readonly data?: unknown; readonly summary?: string | undefined }
  | { readonly ok: false; readonly code: string; readonly msg: string; readonly fix?: string | undefined }

/* -------------------------------------------------------------------------------
 * 四、ModuleKind class
 * ----------------------------------------------------------------------------- */

export class ModuleKind {
  /* ── 元数据（构造后不可变）──────────────────────────────── */

  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly parentKind?: string | undefined
  public readonly attributes: readonly ModuleAttributeMetadata[]
  public readonly actions: readonly ModuleActionMetadata[]
  public readonly payloads: readonly ModuleParameterPayloadMetadata[]
  public readonly children: readonly string[]

  /** 按名称索引的属性表（内部快速查找） */
  private readonly moduleAttributeByName: ReadonlyMap<string, ModuleAttributeMetadata>
  /** 按名称索引的动作表（内部快速查找） */
  private readonly moduleActionByName: ReadonlyMap<string, ModuleActionMetadata>

  /* ── 运行时委托（构造后不可变，只通过协议方法访问）────────── */

  private readonly actionRunner: ModuleKindRunner
  private readonly childLister: ModuleChildrenLister
  private readonly instanceFinder: ModuleInstanceFinder

  /* ── 构造函数 ──────────────────────────────────────────── */

  public constructor(options: ModuleKindOptions) {
    this.kind = options.kind
    this.name = options.name
    this.description = options.description
    this.parentKind = normalizeParentKind(options.parentKind, options.kind)
    this.attributes = normalizeAttributeMetadata(options.attributes ?? [])
    this.moduleAttributeByName = createNamedMap(this.attributes, 'attribute')
    this.actions = normalizeActionMetadata(options.actions ?? [])
    this.moduleActionByName = createNamedMap(this.actions, 'action')
    this.payloads = normalizePayloadMetadata(options.payloads ?? [], options.kind)
    this.children = normalizeChildKinds(options.children ?? [], options.kind)

    this.actionRunner = options.runner ?? ((_ctx, actionName) => actionNotImplemented(this.kind, actionName))
    this.childLister = options.list ?? (() => ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([]))
    this.instanceFinder = options.find ?? ((ctx, childKind) => {
      // 默认 find：仅当 childKind 等于自身 kind 且非路径查询时返回当前实例
      if (childKind !== this.kind || ctx.segments.length !== 0) {
        return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([])
      }
      const ref = this.createCurrentInstanceRef(ctx)
      return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>(ref === null ? [] : [ref])
    })
  }

  /* ── 元数据查询 ────────────────────────────────────────── */

  /** 按名查找属性元数据 */
  public findAttribute(attrName: string): ModuleAttributeMetadata | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  /** 按名查找动作元数据 */
  public findAction(actionName: string): ModuleActionMetadata | undefined {
    return this.moduleActionByName.get(actionName)
  }

  /* ── 属性访问 ──────────────────────────────────────────── */

  /**
   * 读取属性值。
   *
   * 校验顺序：属性声明 → readable 权限 → runner 属性存在 → JSON 可序列化
   */
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

    const rawValue: unknown = Reflect.get(this.actionRunner, attrName)
    if (rawValue === undefined) {
      return Promise.resolve(ModuleOperationResult.failCode(
        'ATTRIBUTE_VALUE_NOT_FOUND',
        `${this.kind} action 委托未设置属性 "${attrName}"`,
        '请确认 ModuleKind 构造期 action 委托函数对象上已设置该属性。',
      ))
    }

    const value = ModuleKind.coerceJsonValue(rawValue)
    if (value === undefined) {
      return Promise.resolve(ModuleOperationResult.failCode(
        'ATTRIBUTE_VALUE_NOT_JSON',
        `${this.kind} action 委托属性 "${attrName}" 不是可序列化 JSON 值`,
        '请把 runner 属性值保持为字符串、数字、布尔、null、数组或普通对象。',
      ))
    }
    return Promise.resolve(ModuleOperationResult.ok(value))
  }

  /**
   * 写入属性值。
   *
   * 校验顺序：属性声明 → writable 权限 → runner 对象写入
   */
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
      const written = Reflect.set(this.actionRunner, attrName, value)
      if (!written) {
        throw new Error('Reflect.set returned false')
      }
    } catch {
      return Promise.resolve(ModuleOperationResult.failCode(
        'ATTRIBUTE_WRITE_FAILED',
        `${this.kind} action 委托属性 "${attrName}" 写入失败`,
        '请确认 ModuleKind 构造期 action 委托函数对象允许写入该属性。',
      ))
    }
    return Promise.resolve(ModuleOperationResult.ok<void>())
  }

  /* ── 动作调用 ──────────────────────────────────────────── */

  /** 执行动作（委托 runner，异常转为 ACTION_EXECUTE_ERROR） */
  public async invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    try {
      return await this.actionRunner(ctx, actionName, args)
    } catch (error) {
      return actionExecuteError(error)
    }
  }

  /* ── 子实例发现 ────────────────────────────────────────── */

  /** 列出子实例（委托 list） */
  public listChildren(
    ctx: ModulePathContext,
    childKind?: string,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.childLister(ctx, childKind))
  }

  /** 查询子实例（委托 find） */
  public findInstance(
    ctx: ModulePathContext,
    childKind: string,
    query: ModuleInstanceQuery,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.instanceFinder(ctx, childKind, query))
  }

  /* ── 子实例解析 ────────────────────────────────────────── */

  /**
   * 验证子实例是否存在。
   * 先调用 find（精确查询），失败或未找到再回退到 list（全量列表）。
   */
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
    if ((found.data ?? []).some((ref) => ref.id === childId)) {
      return ModuleOperationResult.ok(true)
    }

    const listed = await this.listChildren(ctx, childKind)
    if (!listed.ok) {
      return ModuleOperationResult.passthroughFailure(listed)
    }
    return ModuleOperationResult.ok((listed.data ?? []).some((ref) => ref.id === childId))
  }

  /* ── 受保护的辅助方法 ──────────────────────────────────── */

  /**
   * 创建当前实例引用（供默认 find 实现使用）。
   * 从 host 上下文中提取 moduleInstanceId 作为当前实例 id。
   */
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

  /** 将业务数据包装为成功的 ModuleOperationResult<LlmJsonValue> */
  protected okJson(data?: unknown, checks?: readonly ModuleCheckEntry[]): ModuleOperationResult<LlmJsonValue> {
    const json = ModuleKind.coerceJsonValue(data)
    return ModuleOperationResult.ok(json, checks)
  }

  /** 单条错误码 + 提示 → 失败的 ModuleOperationResult<LlmJsonValue> */
  protected failJson(code: string, message: string, hint?: string): ModuleOperationResult<LlmJsonValue> {
    return ModuleOperationResult.failCode(code, message, hint)
  }

  /**
   * 将业务方的 { ok, data/code/msg/fix } 格式投影为标准 ModuleOperationResult。
   * 成功时从 summary 创建 info 级 check；失败时 code/msg/fix 映射到 error check。
   */
  protected serviceResultToOperationResult(result: ModuleActionServiceResult): ModuleOperationResult<LlmJsonValue> {
    if (result.ok) {
      return this.okJson(
        result.data,
        result.summary === undefined ? undefined : [ModuleCheckEntry.info('OK', result.summary)],
      )
    }
    return this.failJson(result.code, result.msg, result.fix)
  }

  /* ── 静态工具 ──────────────────────────────────────────── */

  /**
   * 将任意 JS 值递归规整为 LlmJsonValue。
   * 不可序列化的值（function、symbol、undefined 等）返回 undefined。
   *
   * 支持：null、string、number、boolean、Array、Set、Map、普通 object。
   */
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

}

/* -------------------------------------------------------------------------------
 * 五、内部：规范化与索引构建
 * ----------------------------------------------------------------------------- */

/** 规范化属性元数据（浅拷贝 + 可选字段按需展开） */
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

/** 规范化动作元数据（浅拷贝 + 数组字段深拷贝防外部修改） */
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

/** 规范化参数荷载元数据，复制数组并 fail-fast 拒绝空 ref、空描述和重复 ref。 */
function normalizePayloadMetadata(payloads: readonly ModuleParameterPayloadMetadata[], ownKind: string): readonly ModuleParameterPayloadMetadata[] {
  const seen = new Set<string>()
  const out: ModuleParameterPayloadMetadata[] = []
  for (const payload of payloads) {
    const payloadRef = payload.payloadRef.trim()
    if (payloadRef.length === 0) {
      throw new Error(`payloadRef for "${ownKind}" must not be empty`)
    }
    if (seen.has(payloadRef)) {
      throw new Error(`duplicate payloadRef "${payloadRef}" on "${ownKind}"`)
    }
    const description = payload.description.trim()
    if (description.length === 0) {
      throw new Error(`payloadRef "${payloadRef}" on "${ownKind}" must include description`)
    }
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
    const normalized = actionName.trim()
    if (normalized.length === 0) {
      throw new Error(`payloadRef "${payloadRef}" on "${ownKind}" must not include empty action name`)
    }
    if (seen.has(normalized)) {
      throw new Error(`duplicate payload action "${normalized}" for "${payloadRef}" on "${ownKind}"`)
    }
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

/** 规范化父模块声明，禁止空值和自引用。 */
function normalizeParentKind(parentKind: string | undefined, ownKind: string): string | undefined {
  if (parentKind === undefined) return undefined
  const normalized = parentKind.trim()
  if (normalized.length === 0) {
    throw new Error(`parentKind for "${ownKind}" must not be empty`)
  }
  if (normalized === ownKind) {
    throw new Error(`parentKind for "${ownKind}" must not point to itself`)
  }
  return normalized
}

/** 规范化子模块声明，复制数组并 fail-fast 拒绝空 kind、重复 kind 和自引用。 */
function normalizeChildKinds(children: readonly string[], ownKind: string): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const child of children) {
    const normalized = child.trim()
    if (normalized.length === 0) {
      throw new Error(`child kind for "${ownKind}" must not be empty`)
    }
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

/** 按 name 字段构建索引 Map（重复 name 直接抛错） */
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

/* -------------------------------------------------------------------------------
 * 六、内部：错误结果工厂
 * ----------------------------------------------------------------------------- */

function actionNotImplemented(kind: string, actionName: string): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'ACTION_NOT_IMPLEMENTED',
    `${kind} 未注册动作 "${actionName}"`,
    '请检查该 ModuleKind 构造期 action 委托是否实现了该 actionName。',
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
