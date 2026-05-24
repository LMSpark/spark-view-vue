/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 模块类型核心                                               │
 * │  Module Kind — Protocol Core                                                  │
 * │                                                                              │
 * │  ModuleKind 是 module-semantic 协议的中心抽象。每个 ModuleKind 实例描述一个    │
 * │  业务能力模块的元数据（属性、动作、子模块）和运行时行为委托。                 │
 * │                                                                              │
 * │  三大职责：                                                                   │
 * │    1. 元数据声明   — attributes / actions / payloads / children              │
 * │    2. 运行时委托   — attributeAccessor / actionRunner / childLister /        │
 * │                      instanceFinder                                          │
 * │    3. 协议级校验   — fail-fast / JSON Schema 校验 / JSON 值规整               │
 * │                                                                              │
 * │  LLM 执行流程（知识工具完成模块/动作/反问判断后）：                              │
 * │    describeKind  → 查看属性/动作/子模块/失败模式/使用规则                       │
 * │    listChildren  → 浏览子实例                                                  │
 * │    findInstance  → 按条件精确查找实例                                           │
 * │    getAttribute  → 读取属性值                                                  │
 * │    setAttribute  → 写入属性值                                                  │
 * │    invokeAction  → 执行业务动作                                                │
 * │                                                                              │
 * │  阅读顺序（按功能流程排列）：                                                   │
 * │    一、元数据类型与构造选项 → 类型定义 + 默认常量                                │
 * │    二、ModuleKind class    → 协议核心实现                                      │
 * │    三、规范化函数         → 构造期校验与标准化                                  │
 * │    四、错误结果工厂       → 失败路径统一出口                                    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import {
  LlmSchemaValidator,
  type LlmJsonObject,
  type LlmJsonSchema,
  type LlmJsonSchemaObject,
  type LlmJsonValue,
  type LlmParamValidationIssue,
  type LlmParamValidationResult,
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

/* ═══════════════════════════════════════════════════════════════════════════════
 * 一、元数据类型与构造选项
 *
 * 本段从属性 → 动作 → 荷载 → 委托 → 构造选项，按「声明什么 → 如何委托
 * → 如何装配」依次定义。所有元数据类型均为 Readonly，构造后不可变。
 * ═════════════════════════════════════════════════════════════════════════════ */

// ── 1.1 属性元数据 ──
// 描述 ModuleKind 暴露给 LLM 的一个可读写属性。
// 属性的实际读写由 attributeAccessor 委托完成，元数据只管声明。

export type ModuleAttributeMetadata = Readonly<{
  /** 属性名（在同一 kind 的 attributes 数组中唯一） */
  name: string
  /** 属性说明（LLM 可见） */
  description: string
  /** 属性值的 JSON Schema（用于 LLM 校验和序列化约束） */
  schema: LlmJsonSchema
  /** 是否可读 */
  readable: boolean
  /** 是否可写 */
  writable: boolean
  /** 示例值（可选，帮助 LLM 理解属性形状） */
  example?: LlmJsonValue
}>

/** 属性访问权限（从 ModuleAttributeMetadata 中提取的可读/可写标记） */
export type ModuleAttributeAccess = Pick<ModuleAttributeMetadata, 'readable' | 'writable'>

// ── 1.2 动作元数据 ──
// 描述 ModuleKind 暴露给 LLM 的一个可调用动作。
// 动作的实际执行由 actionRunner 委托完成。

export type ModuleActionFailureMode = Readonly<{
  /** 错误码（LLM 可见，用于识别失败类型） */
  code: string
  /** 发生条件（自然语言描述什么时候会出现这个错误） */
  when: string
  /** 修复建议（LLM 在失败后可参考的恢复步骤） */
  fix: string
}>

/** 动作结果 schema（支持简单类型或完整 JSON Schema） */
export type ModuleActionResultSchema = LlmJsonSchema | LlmJsonObject

export type ModuleActionMetadata = Readonly<{
  /** 动作名（在同一 kind 的 actions 数组中唯一） */
  name: string
  /** 动作说明（LLM 可见） */
  description: string
  /** 参数 schema（JSON Schema object root，用于 LLM 参数校验） */
  paramsSchema: LlmJsonSchemaObject
  /** 返回值 schema（可选，帮助 LLM 理解返回值结构） */
  resultSchema?: ModuleActionResultSchema
  /** 使用规则（多条，LLM 在调用前阅读） */
  usageRules?: readonly string[]
  /** 失败模式（多条，LLM 在调用失败后参考修复） */
  failureModes?: readonly ModuleActionFailureMode[]
  /** 调用示例（帮助 LLM 理解参数形状） */
  example?: LlmJsonValue
}>

// ── 1.3 参数荷载元数据 ──
// 描述某个 ModuleKind 依赖的外部参数指南 provider。
// 例如 spark.component 的组件目录清单。

export type ModuleParameterPayloadMetadata = Readonly<{
  /** provider 唯一命名空间，例如 "spark.component" */
  payloadRef: string
  /** 该 payload 与当前模块的关系说明 */
  description: string
  /** 该 payload 通常服务的 action 名；为空表示模块级通用 */
  requiredForActions?: readonly string[]
}>

// ── 1.4 属性访问委托 ──
// 属性的读写不再直接操作 runner 对象，而是通过该委托完成。
// 业务方在构造 ModuleKind 时注入，支持异步、校验、权限控制等自定义逻辑。

export type ModuleAttributeAccessor = Readonly<{
  get: (ctx: ModulePathContext, attrName: string) => ModuleKindOperation<unknown>
  set: (ctx: ModulePathContext, attrName: string, value: LlmJsonValue) => ModuleKindOperation<void>
}>

// ── 1.5 构造选项 ──
// ModuleKind 构造函数的唯一入参，汇集元数据声明和运行时委托。

export type ModuleKindOptions = Readonly<{
  /** 模块类型标识（全小写，如 "school"、"page-design"），在注册表中唯一 */
  kind: string
  /** 模块显示名（LLM 可见） */
  name: string
  /** 模块说明（LLM 可见，描述该模块的业务能力） */
  description: string
  /** 父模块 kind（可选，用于表达模块层级关系） */
  parentKind?: string
  /** 属性表（可选，声明 LLM 可读写的一组属性） */
  attributes?: readonly ModuleAttributeMetadata[]
  /** 动作表（可选，声明 LLM 可调用的一组动作） */
  actions?: readonly ModuleActionMetadata[]
  /** 参数荷载引用（可选，声明模块依赖的外部参数指南） */
  payloads?: readonly ModuleParameterPayloadMetadata[]
  /** 子模块 kind 列表（可选，声明该模块允许包含的子模块类型） */
  children?: readonly string[]
  /** 属性读写委托（声明了 attributes 时必填） */
  attributeAccessor?: ModuleAttributeAccessor
  /** 动作执行委托（未提供时默认返回 ACTION_NOT_IMPLEMENTED） */
  runner?: ModuleKindRunner
  /** 子实例列表委托（未提供时默认返回空列表） */
  list?: ModuleChildrenLister
  /** 子实例查询委托（未提供时默认返回仅含当前实例的列表） */
  find?: ModuleInstanceFinder
}>

// ── 1.6 内部辅助类型 ──
// 仅供 class 内部使用，不导出。

/** 业务动作的返回值（serviceResultToOperationResult 的输入格式） */
type ModuleActionServiceResult =
  | { readonly ok: true; readonly data?: unknown; readonly summary?: string }
  | { readonly ok: false; readonly code: string; readonly msg: string; readonly fix?: string }

// ── 1.7 默认属性访问委托 ──
// 当 ModuleKind 未声明 attributes 时使用。不抛错（无属性时 getAttribute/setAttribute
// 不会到达委托），仅作为安全兜底。

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

/* ═══════════════════════════════════════════════════════════════════════════════
 * 二、ModuleKind class — 协议核心实现
 *
 * 实例化流程：
 *   1. 调用方传入 ModuleKindOptions
 *   2. 构造函数规范化所有字段（fail-fast 拒绝空值、重复、自引用）
 *   3. 声明 attributes 时必须提供 attributeAccessor，否则抛错
 *   4. 构建 name → metadata 的 Map 索引
 *   5. 未提供的委托填充默认实现
 *
 * 设计原则：
 *   - 元数据仅声明"有什么"，委托决定"怎么做"
 *   - 所有协议方法返回 Promise<ModuleOperationResult<T>>，支持同步和异步委托
 *   - JSON Schema 校验统一由 LlmSchemaValidator 完成，不引入私有 DSL
 * ═════════════════════════════════════════════════════════════════════════════ */

export class ModuleKind {
  // ── 2.1 字段声明 ──

  // 元数据字段（公开只读，构造后不可变）
  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly parentKind?: string
  public readonly attributes: readonly ModuleAttributeMetadata[]
  public readonly actions: readonly ModuleActionMetadata[]
  public readonly payloads: readonly ModuleParameterPayloadMetadata[]
  public readonly children: readonly string[]

  // 按 name 建索引的 Map（内部快速查找，不走数组遍历）
  private readonly moduleAttributeByName: ReadonlyMap<string, ModuleAttributeMetadata>
  private readonly moduleActionByName: ReadonlyMap<string, ModuleActionMetadata>

  // 运行时委托（构造后不可变，只通过协议方法访问）
  private readonly actionRunner: ModuleKindRunner
  private readonly attributeAccessor: ModuleAttributeAccessor
  private readonly childLister: ModuleChildrenLister
  private readonly instanceFinder: ModuleInstanceFinder

  // ── 2.2 构造函数 ──

  public constructor(options: ModuleKindOptions) {
    // 第一阶段：规范化元数据（trim + fail-fast 校验）
    const kind = normalizeRequiredText(options.kind, 'kind')
    this.kind = kind
    this.name = normalizeRequiredText(options.name, `name for "${kind}"`)
    this.description = normalizeRequiredText(options.description, `description for "${kind}"`)
    const parentKind = normalizeParentKind(options.parentKind, kind)
    if (parentKind !== undefined) {
      this.parentKind = parentKind
    }
    this.attributes = normalizeAttributeMetadata(options.attributes ?? [], kind)
    this.moduleAttributeByName = createNamedMap(this.attributes, 'attribute')
    this.actions = normalizeActionMetadata(options.actions ?? [], kind)
    this.moduleActionByName = createNamedMap(this.actions, 'action')
    this.payloads = normalizePayloadMetadata(options.payloads ?? [], kind)
    this.children = normalizeChildKinds(options.children ?? [], kind)

    // 第二阶段：属性委托必填校验
    if (this.attributes.length > 0 && options.attributeAccessor === undefined) {
      throw new Error(`attributeAccessor for "${kind}" is required when attributes are declared`)
    }

    // 第三阶段：填充默认委托
    this.attributeAccessor = options.attributeAccessor ?? EMPTY_ATTRIBUTE_ACCESSOR
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

  // ── 2.3 元数据查询 ──
  // O(1) Map 查找。供 Navigator、describeKind 和内部校验使用。

  public findAttribute(attrName: string): ModuleAttributeMetadata | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  public findAction(actionName: string): ModuleActionMetadata | undefined {
    return this.moduleActionByName.get(actionName)
  }

  // ── 2.4 属性读 ──
  // 校验链：属性声明 → readable 权限 → attributeAccessor.get → JSON 序列化 → schema 校验
  // 对应 LLM 工具 getAttribute(path, attrName)。

  public async getAttribute(
    ctx: ModulePathContext,
    attrName: string,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    // 1. 属性是否已声明
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return attributeNotDeclared(this.kind, attrName)
    }
    // 2. 是否可读
    if (!attr.readable) {
      return attributeNotReadable(this.kind, attrName)
    }

    try {
      // 3. 委托 attributeAccessor 读取原始值
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

      // 4. JSON 序列化校验
      const value = ModuleKind.coerceJsonValue(result.data)
      if (value === undefined) {
        return ModuleOperationResult.failCode(
          'ATTRIBUTE_VALUE_NOT_JSON',
          `${this.kind} 属性 "${attrName}" 不是可序列化 JSON 值`,
          '请把属性值保持为字符串、数字、布尔、null、数组或普通对象。',
        )
      }

      // 5. 业务 schema 校验
      const validation: LlmParamValidationResult = LlmSchemaValidator.validateJsonValue(value, attr.schema)
      if (!validation.ok) {
        return schemaValidationFailed(
          `${this.kind}.${attrName} 属性值`,
          validation.issues,
          '请按该属性在 describeKind 中声明的 schema 修正属性值。',
        )
      }
      return ModuleOperationResult.ok(value)
    } catch (error: unknown) {
      return attributeReadFailed(this.kind, attrName, error)
    }
  }

  // ── 2.5 属性写 ──
  // 校验链：属性声明 → writable 权限 → schema 校验 → attributeAccessor.set
  // 对应 LLM 工具 setAttribute(path, attrName, value)。

  public async setAttribute(
    ctx: ModulePathContext,
    attrName: string,
    value: LlmJsonValue,
  ): Promise<ModuleOperationResult<void>> {
    // 1. 属性是否已声明
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return attributeNotDeclared(this.kind, attrName)
    }
    // 2. 是否可写
    if (!attr.writable) {
      return attributeNotWritable(this.kind, attrName)
    }

    // 3. 写入前 schema 校验
    const validation = LlmSchemaValidator.validateJsonValue(value, attr.schema)
    if (!validation.ok) {
      return schemaValidationFailed(
        `${this.kind}.${attrName} 属性写入值`,
        validation.issues,
        '请按该属性在 describeKind 中声明的 schema 修正 value。',
      )
    }

    try {
      // 4. 委托 attributeAccessor 写入
      const result = await this.attributeAccessor.set(ctx, attrName, value)
      if (!result.ok) {
        return ModuleOperationResult.passthroughFailure(result)
      }
      return ModuleOperationResult.ok<void>()
    } catch (error: unknown) {
      return attributeWriteFailed(this.kind, attrName, error)

    }
  }

  // ── 2.6 动作调用 ──
  // 校验链：action 声明 → paramsSchema 校验 → runAction（委托 runner）
  // 对应 LLM 工具 invokeAction(path, actionName, args)。

  public async invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    // 1. 动作是否已声明
    const action = this.findAction(actionName)
    if (action === undefined) {
      return actionNotDeclared(this.kind, actionName)
    }

    // 2. 参数 schema 校验
    const validation = LlmSchemaValidator.validateLlmDeserializedParams(args, action.paramsSchema)
    if (!validation.ok) {
      return schemaValidationFailed(
        `${this.kind}.${actionName} 参数`,
        validation.issues,
        '请按该 action 在 describeKind 中声明的 paramsSchema 调整参数后重试。',
      )
    }

    // 3. 委托 runner 执行
    try {
      return await this.runAction(ctx, actionName, args)
    } catch (error: unknown) {
      return actionExecuteError(error)
    }
  }

  /** 受保护的 actionRunner 调用入口，子类可覆盖以添加拦截逻辑。 */
  protected runAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): ModuleKindOperation<LlmJsonValue> {
    return this.actionRunner(ctx, actionName, args)
  }

  // ── 2.7 子实例列表 ──

  /** 列出子实例，委托 childLister。对应 LLM 工具 listChildren(path, childKind?)。 */
  public listChildren(
    ctx: ModulePathContext,
    childKind?: string,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.childLister(ctx, childKind))
  }

  // ── 2.8 子实例查询 ──

  /** 按条件查询子实例，委托 instanceFinder。对应 LLM 工具 findInstance(path, childKind, query)。 */
  public findInstance(
    ctx: ModulePathContext,
    childKind: string,
    query: ModuleInstanceQuery,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.instanceFinder(ctx, childKind, query))
  }

  // ── 2.9 子实例解析 ──
  // 验证子实例是否存在。策略：先调 findInstance（精确查询），失败则向上透传错误，
  // 成功则检查结果中是否包含目标 id。用于 Navigator 验证路径段的父子关系。

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

  // ── 2.10 受保护的辅助方法 ──

  /** 从 host 上下文中提取当前实例引用（供默认 find 实现使用）。 */
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

  /** 错误码 + 提示 → 失败的 ModuleOperationResult<LlmJsonValue> */
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

  // ── 2.11 静态工具方法 ──

  /**
   * 将任意 JS 值递归规整为 LlmJsonValue（公共入口）。
   * 使用内部 WeakSet 防循环引用，支持 null/string/number/bigint/symbol/boolean
   * /Date/URL/ArrayBuffer/TypedArray/Array/Set/Map/普通 object。
   */
  public static coerceJsonValue(value: unknown): LlmJsonValue | undefined {
    return ModuleKind.coerceJsonValueInternal(value, new WeakSet<object>())
  }

  /** 内部递归实现：通过 seen 跟踪已访问对象，防止无限递归。 */
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
    if (isUnknownArray(value)) {
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

/* ═══════════════════════════════════════════════════════════════════════════════
 * 三、规范化函数
 *
 * 以下函数仅在 ModuleKind 构造函数中被调用。职责：
 *   1. trim 空白 + fail-fast 拒绝空字符串
 *   2. 浅拷贝 / 深拷贝数组字段，防止外部后续修改污染内部状态
 *   3. 校验重复 name、自引用 parentKind/children
 *
 * 所有规范化函数均接收 ownKind 参数，用于生成可定位的错误消息。
 * ═════════════════════════════════════════════════════════════════════════════ */

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

/** 通用必填文本校验：trim 后不得为空 */
function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`)
  }
  return normalized
}

/** 规范化属性元数据：trim name/description，浅拷贝可选字段 */
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

/** 规范化动作元数据：trim name/description，深拷贝 usageRules/failureModes 防外部修改 */
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

/** 规范化参数荷载元数据：去重，fail-fast 拒绝空 ref / 空描述 / 重复 ref */
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

/** 规范化荷载关联的动作名列表：去重，fail-fast 拒绝空名 / 重复名 */
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

/** 规范化父模块声明：拒绝空值和自引用 */
function normalizeParentKind(parentKind: string | undefined, ownKind: string): string | undefined {
  if (parentKind === undefined) return undefined
  const normalized = normalizeRequiredText(parentKind, `parentKind for "${ownKind}"`)
  if (normalized === ownKind) {
    throw new Error(`parentKind for "${ownKind}" must not point to itself`)
  }
  return normalized
}

/** 规范化子模块声明：去重，fail-fast 拒绝空 kind / 重复 kind / 自引用 */
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

/* ═══════════════════════════════════════════════════════════════════════════════
 * 四、错误结果工厂
 *
 * 以下函数统一返回标准 ModuleOperationResult 失败值，被 class 的各类校验失败
 * 路径和默认委托使用。集中放在文件末尾，便于维护错误文案和错误码。
 * ═════════════════════════════════════════════════════════════════════════════ */

/** JSON Schema 校验失败：汇总 issues 为 check entries */
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

/** 动作未实现：未提供 runner 或 runner 不识别该 actionName */
function actionNotImplemented(kind: string, actionName: string): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'ACTION_NOT_IMPLEMENTED',
    `${kind} 未注册动作 "${actionName}"`,
    '请检查该 ModuleKind 构造期 action 委托是否实现了该 actionName。',
  )
}

/** 动作未声明：kind 的 actions 表中找不到该 actionName */
function actionNotDeclared(kind: string, actionName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ACTION_NOT_DECLARED',
    `kind "${kind}" 未声明动作 "${actionName}"`,
    '可调用 describeKind 查看该 kind 的动作表。',
  )
}

/** 属性未声明：kind 的 attributes 表中找不到该 attrName */
function attributeNotDeclared(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_DECLARED',
    `kind "${kind}" 未声明属性 "${attrName}"`,
    '可调用 describeKind 查看该 kind 的属性表。',
  )
}

/** 属性不可读：已声明但 readable 为 false */
function attributeNotReadable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_READABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可读`,
    '请只读取 readable=true 的属性；可调用 describeKind 查看属性权限。',
  )
}

/** 属性不可写：已声明但 writable 为 false */
function attributeNotWritable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_WRITABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可写`,
    '请只写入 writable=true 的属性；可调用 describeKind 查看属性权限。',
  )
}

/** 属性读取异常：attributeAccessor.get 抛出未捕获异常 */
function attributeReadFailed(kind: string, attrName: string, error: unknown): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_READ_FAILED',
    error instanceof Error ? error.message : `${kind} 属性 "${attrName}" 读取失败`,
    '检查 ModuleKind 构造期 attributeAccessor.get 实现。',
  )
}

/** 属性写入异常：attributeAccessor.set 抛出未捕获异常 */
function attributeWriteFailed(kind: string, attrName: string, error: unknown): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_WRITE_FAILED',
    error instanceof Error ? error.message : `${kind} 属性 "${attrName}" 写入失败`,
    '检查 ModuleKind 构造期 attributeAccessor.set 实现。',
  )
}

/** 动作执行异常：actionRunner 抛出未捕获异常时统一包装 */
function actionExecuteError(error: unknown): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'ACTION_EXECUTE_ERROR',
    error instanceof Error ? error.message : String(error),
    '检查动作 runner 实现；业务可捕获异常后返回更具体的 OperationResult。',
  )
}
