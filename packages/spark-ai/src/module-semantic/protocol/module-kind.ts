/**
 * module-semantic · 模块类型核心
 *
 * ModuleKind 是协议的中心抽象，每个实例描述一个业务能力模块的元数据和运行时行为。
 *
 * 三大职责：
 *   1. 元数据声明 — attributes / functions / payloads / children
 *   2. 运行时委托 — attributeAccessor / functionRunner / childLister / instanceFinder
 *   3. 协议级校验 — fail-fast 构造 / JSON Schema 校验 / JSON 值规整
 *
 * LLM 执行流程：
 *   describeKind → listChildren / findInstance → getAttribute / setAttribute / invokeFunction
 *
 * 文件结构：内部辅助 → ModuleKind class → 规范化函数 → 错误工厂
 */

import {
  LlmSchemaValidator,
  coerceJsonValue,
  type LlmJsonValue,
  type LlmParamValidationIssue,
  type LlmParamValidationResult,
} from '../../schema'
import type {
  ModuleFunctionMetadata,
  ModuleAttributeMetadata,
  ModuleKindOptions,
  ModuleParameterPayloadMetadata,
} from './module-metadata'
import type {
  ModuleAttributeAccessor,
  ModuleChildrenLister,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOperation,
  ModuleKindRunner,
  ModulePathContext,
} from './module-context'
import { ModuleCheckEntry, ModuleOperationResult } from './module-operation'

// ============================================================================
// 一、内部辅助（仅 class 内部使用）
// ============================================================================

/**
 * 业务方 runner 可返回的原始格式。
 * 由 serviceResultToOperationResult 投影为标准 ModuleOperationResult。
 */
type ModuleFunctionServiceResult =
  | { readonly ok: true; readonly data?: unknown; readonly summary?: string }
  | { readonly ok: false; readonly code: string; readonly msg: string; readonly fix?: string }

/** 非空字符串列表的通用规范化入参，集中处理 trim、去重和业务约束。 */
type RequiredTextListOptions = Readonly<{
  values: readonly string[]
  field: string
  duplicate: (value: string) => string
  validate?: (value: string) => void
}>

/** 默认属性访问委托。未声明 attributes 时使用，安全兜底。 */
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

// ============================================================================
// 二、ModuleKind class
//
// 实例化采用三阶段构造：规范化元数据 → 必填校验 → 填充默认委托
// 所有协议方法返回 Promise<ModuleOperationResult<T>>，兼容同步和异步委托
// JSON Schema 校验统一由 LlmSchemaValidator 完成，错误结果由第四节工厂统一构造
// ============================================================================

export class ModuleKind {
  // ── 字段 ──

  // 元数据（公开只读，构造后不可变）
  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly parentKind?: string
  public readonly attributes: readonly ModuleAttributeMetadata[]
  public readonly functions: readonly ModuleFunctionMetadata[]
  public readonly payloads: readonly ModuleParameterPayloadMetadata[]
  public readonly children: readonly string[]

  // name → metadata 索引（O(1) Map 查找，避免数组遍历）
  private readonly moduleAttributeByName: ReadonlyMap<string, ModuleAttributeMetadata>
  private readonly moduleFunctionByName: ReadonlyMap<string, ModuleFunctionMetadata>

  // 运行时委托（构造后不可变）
  private readonly attributeAccessor: ModuleAttributeAccessor
  private readonly functionRunner: ModuleKindRunner
  private readonly childLister: ModuleChildrenLister
  private readonly instanceFinder: ModuleInstanceFinder

  // ── 构造函数（三阶段：规范化 → 必填校验 → 默认委托）──

  public constructor(options: ModuleKindOptions) {
    // 第一阶段：规范化元数据（trim + fail-fast）
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
    this.functions = normalizeFunctionMetadata(options.functions ?? [], kind)
    this.moduleFunctionByName = createNamedMap(this.functions, 'function')
    this.payloads = normalizePayloadMetadata(options.payloads ?? [], kind)
    this.children = normalizeChildKinds(options.children ?? [], kind)

    // 第二阶段：属性委托必填校验
    if (this.attributes.length > 0 && options.attributeAccessor === undefined) {
      throw new Error(`attributeAccessor for "${kind}" is required when attributes are declared`)
    }

    // 第三阶段：填充默认委托
    this.attributeAccessor = options.attributeAccessor ?? EMPTY_ATTRIBUTE_ACCESSOR
    this.functionRunner = options.runner ?? ((_ctx, functionName) => functionNotImplemented(this.kind, functionName))
    this.childLister = options.list ?? (() => ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([]))
    this.instanceFinder = options.find ?? ((ctx, childKind) => {
      if (childKind !== this.kind || ctx.segments.length !== 0) {
        return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>([])
      }
      const ref = this.createCurrentInstanceRef(ctx)
      return ModuleOperationResult.ok<readonly ModuleInstanceRef[]>(ref === null ? [] : [ref])
    })
  }

  // ── 元数据查询（O(1) Map 查找）──

  /** 按 name 查找属性元数据。供 Navigator 和内部校验使用。 */
  public findAttribute(attrName: string): ModuleAttributeMetadata | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  /** 按 name 查找函数元数据。供 Navigator、describeKind 和内部校验使用。 */
  public findFunction(functionName: string): ModuleFunctionMetadata | undefined {
    return this.moduleFunctionByName.get(functionName)
  }

  // ── 属性读取（5 步校验链：声明 → 可读 → 委托读取 → JSON 序列化 → schema 校验）──

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

      const value = coerceJsonValue(result.data)
      if (value === undefined) {
        return ModuleOperationResult.failCode(
          'ATTRIBUTE_VALUE_NOT_JSON',
          `${this.kind} 属性 "${attrName}" 不是可序列化 JSON 值`,
          '请把属性值保持为字符串、数字、布尔、null、数组或普通对象。',
        )
      }

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

  // ── 属性写入（4 步校验链：声明 → 可写 → schema 校验 → 委托写入）──

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
    } catch (error: unknown) {
      return attributeWriteFailed(this.kind, attrName, error)
    }
  }

  // ── 函数调用（3 步校验链：声明 → 参数 schema 校验 → 委托执行）──

  public async invokeFunction(
    ctx: ModulePathContext,
    functionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleOperationResult<LlmJsonValue>> {
    const fn = this.findFunction(functionName)
    if (fn === undefined) {
      return functionNotDeclared(this.kind, functionName)
    }

    const validation = LlmSchemaValidator.validateLlmDeserializedParams(args, fn.paramsSchema)
    if (!validation.ok) {
      return schemaValidationFailed(
        `${this.kind}.${functionName} 参数`,
        validation.issues,
        '请按该函数在 describeKind 中声明的 paramsSchema 调整参数后重试。',
      )
    }

    try {
      return await this.runFunction(ctx, functionName, args)
    } catch (error: unknown) {
      return functionExecuteError(error)
    }
  }

  /** 受保护的 runner 入口。子类可覆盖以添加拦截/日志/审计逻辑。 */
  protected runFunction(
    ctx: ModulePathContext,
    functionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): ModuleKindOperation<LlmJsonValue> {
    return this.functionRunner(ctx, functionName, args)
  }

  // ── 子实例操作 ──

  /** 列出子实例（委托 childLister） */
  public listChildren(
    ctx: ModulePathContext,
    childKind?: string,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.childLister(ctx, childKind))
  }

  /** 按条件查询子实例（委托 instanceFinder） */
  public findInstance(
    ctx: ModulePathContext,
    childKind: string,
    query: ModuleInstanceQuery,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.instanceFinder(ctx, childKind, query))
  }

  /**
   * 验证子实例是否存在于当前 children 声明中。
   * 先查 children 表 → findInstance 精确查询 → 检查结果中是否含目标 id。
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
    return ModuleOperationResult.ok((found.data ?? []).some((ref) => ref.id === childId))
  }

  // ── 受保护辅助 ──

  /** 从 host 上下文提取当前实例引用（供默认 find 实现使用） */
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

  /** 将任意数据规整后包装为成功的 ModuleOperationResult<LlmJsonValue> */
  protected okJson(data?: unknown, checks?: readonly ModuleCheckEntry[]): ModuleOperationResult<LlmJsonValue> {
    const json = coerceJsonValue(data)
    return ModuleOperationResult.ok(json, checks)
  }

  /** 错误码 + 描述 + 修复建议 → 失败的 ModuleOperationResult<LlmJsonValue> */
  protected failJson(code: string, message: string, hint?: string): ModuleOperationResult<LlmJsonValue> {
    return ModuleOperationResult.failCode(code, message, hint)
  }

  /**
   * 将业务方 { ok, data/code/msg/fix } 格式投影为标准 ModuleOperationResult。
   * 成功时 summary → info 级 check；失败时 code/msg/fix → error 级 check。
   */
  protected serviceResultToOperationResult(result: ModuleFunctionServiceResult): ModuleOperationResult<LlmJsonValue> {
    if (result.ok) {
      return this.okJson(
        result.data,
        result.summary === undefined ? undefined : [ModuleCheckEntry.info('OK', result.summary)],
      )
    }
    return this.failJson(result.code, result.msg, result.fix)
  }

  // ── 静态工具 ──

  /** 将任意 JS 值递归规整为 LlmJsonValue。委托到 schema/coercion。 */
  public static coerceJsonValue(value: unknown): LlmJsonValue | undefined {
    return coerceJsonValue(value)
  }
}

// ============================================================================
// 三、规范化函数（构造期调用，fail-fast 策略）
//
// 职责：trim 空白 + 浅/深拷贝防外部污染 + 校验重复 name、自引用
// 每个函数接收 ownKind 参数，用于生成可定位的错误消息。
// ============================================================================

/** trim 后不得为空，否则抛错 */
function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`)
  }
  return normalized
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

// ── 属性元数据规范化 ──

function normalizeAttributeMetadata(
  attributes: readonly ModuleAttributeMetadata[],
  ownKind: string,
): readonly ModuleAttributeMetadata[] {
  return attributes.map((attribute) => ({
    name: normalizeRequiredText(attribute.name, `attribute name for "${ownKind}"`),
    description: normalizeRequiredText(
      attribute.description,
      `attribute "${attribute.name}" description for "${ownKind}"`,
    ),
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    ...(attribute.example === undefined ? {} : { example: attribute.example }),
  }))
}

// ── 函数元数据规范化 ──

function normalizeFunctionMetadata(
  functions: readonly ModuleFunctionMetadata[],
  ownKind: string,
): readonly ModuleFunctionMetadata[] {
  return functions.map((fn) => ({
    name: normalizeRequiredText(fn.name, `function name for "${ownKind}"`),
    description: normalizeRequiredText(
      fn.description,
      `function "${fn.name}" description for "${ownKind}"`,
    ),
    paramsSchema: fn.paramsSchema,
    ...(fn.resultSchema === undefined ? {} : { resultSchema: fn.resultSchema }),
    ...(fn.usageRules === undefined ? {} : { usageRules: [...fn.usageRules] }),
    ...(fn.failureModes === undefined
      ? {}
      : { failureModes: fn.failureModes.map((mode) => ({ ...mode })) }),
    ...(fn.example === undefined ? {} : { example: fn.example }),
  }))
}

// ── 参数荷载规范化 ──

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
    const description = normalizeRequiredText(
      payload.description,
      `payloadRef "${payloadRef}" description for "${ownKind}"`,
    )
    const requiredForFunctions = normalizePayloadFunctionNames(
      payload.requiredForFunctions ?? [],
      ownKind,
      payloadRef,
    )
    seen.add(payloadRef)
    out.push({
      payloadRef,
      description,
      ...(requiredForFunctions.length === 0 ? {} : { requiredForFunctions }),
    })
  }
  return out
}

/** 荷载关联函数名去重，fail-fast 拒绝空名/重复名 */
function normalizePayloadFunctionNames(
  functionNames: readonly string[],
  ownKind: string,
  payloadRef: string,
): readonly string[] {
  return normalizeRequiredUniqueTexts({
    values: functionNames,
    field: `payload function for "${payloadRef}" on "${ownKind}"`,
    duplicate: (functionName) => `duplicate payload function "${functionName}" for "${payloadRef}" on "${ownKind}"`,
  })
}

// ── 父子关系规范化 ──

/** 拒绝空值 + 自引用 */
function normalizeParentKind(parentKind: string | undefined, ownKind: string): string | undefined {
  if (parentKind === undefined) return undefined
  const normalized = normalizeRequiredText(parentKind, `parentKind for "${ownKind}"`)
  if (normalized === ownKind) {
    throw new Error(`parentKind for "${ownKind}" must not point to itself`)
  }
  return normalized
}

/** 子模块声明去重，fail-fast 拒绝空 kind / 重复 kind / 自引用 */
function normalizeChildKinds(children: readonly string[], ownKind: string): readonly string[] {
  return normalizeRequiredUniqueTexts({
    values: children,
    field: `child kind for "${ownKind}"`,
    duplicate: (childKind) => `duplicate child kind "${childKind}" on "${ownKind}"`,
    validate: (childKind) => {
      if (childKind === ownKind) {
        throw new Error(`child kind for "${ownKind}" must not point to itself`)
      }
    },
  })
}

/**
 * 规范化非空字符串列表。
 * 约束顺序固定为 trim → 自定义校验 → 去重，保证错误信息可定位且无静默回退。
 */
function normalizeRequiredUniqueTexts(options: RequiredTextListOptions): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of options.values) {
    const normalized = normalizeRequiredText(value, options.field)
    options.validate?.(normalized)
    if (seen.has(normalized)) {
      throw new Error(options.duplicate(normalized))
    }
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

// ============================================================================
// 四、错误结果工厂（按协议方法分组）
//
// 统一返回标准 ModuleOperationResult 失败值。每个函数对应一个明确的协议错误码，
// LLM 可据此分支处理。
//
// 分组：Schema 校验 / 动作相关 / 属性相关 / 执行异常
// ============================================================================

// ── Schema 校验错误 ──

/** JSON Schema 校验失败：汇总所有 issues 为 summary + details 两级 check */
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
    ModuleCheckEntry.error(
      'SCHEMA_VALIDATION_FAILED',
      `${issue.path} ${issue.message}`,
      hint,
    ),
  )
  return ModuleOperationResult.fail([summary, ...details])
}

// ── 函数相关错误 ──

/** 函数未实现：runner 未提供或不识别该 functionName */
function functionNotImplemented(kind: string, functionName: string): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'FUNCTION_NOT_IMPLEMENTED',
    `${kind} 未注册函数 "${functionName}"`,
    '请检查该 ModuleKind 构造期 runner 委托是否实现了该 functionName。',
  )
}

/** 函数未声明：kind 的 functions 表中找不到该 functionName */
function functionNotDeclared(kind: string, functionName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'FUNCTION_NOT_DECLARED',
    `kind "${kind}" 未声明函数 "${functionName}"`,
    '可调用 describeKind 查看该 kind 的函数表。',
  )
}

// ── 属性相关错误 ──

/** 属性未声明：kind 的 attributes 表中找不到该 attrName */
function attributeNotDeclared(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_DECLARED',
    `kind "${kind}" 未声明属性 "${attrName}"`,
    '可调用 describeKind 查看该 kind 的属性表。',
  )
}

/** 属性不可读：已声明但 readable=false */
function attributeNotReadable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_READABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可读`,
    '请只读取 readable=true 的属性；可调用 describeKind 查看属性权限。',
  )
}

/** 属性不可写：已声明但 writable=false */
function attributeNotWritable(kind: string, attrName: string): ModuleOperationResult<never> {
  return ModuleOperationResult.failCode(
    'ATTRIBUTE_NOT_WRITABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可写`,
    '请只写入 writable=true 的属性；可调用 describeKind 查看属性权限。',
  )
}

// ── 执行异常错误 ──

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

/** 函数执行异常：functionRunner 抛出未捕获异常时统一包装 */
function functionExecuteError(error: unknown): ModuleOperationResult<LlmJsonValue> {
  return ModuleOperationResult.failCode(
    'FUNCTION_EXECUTE_ERROR',
    error instanceof Error ? error.message : String(error),
    '检查函数 runner 实现；业务可捕获异常后返回更具体的 OperationResult。',
  )
}
