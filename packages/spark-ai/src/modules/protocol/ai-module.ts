/**
 * modules · 模块类型核心
 *
 * 协议层级：第 6 层（核心层，依赖所有下层协议文件）
 * 核心职责：AiModule 是协议的中心抽象。每个实例描述一个业务能力模块的元数据和运行时行为，
 *   并在 LLM 操作时执行协议级校验链（声明校验 → schema 校验 → 委托执行 → 结果规整）。
 * 上游依赖：module-operation、module-metadata、module-context、schema
 * 下游消费：Navigator（路径解析后调用协议方法）、AiModuleRuntime（注册 + 工具生成）、
 *          Host 层（构造具体业务 AiModule 子类）
 *
 * 三大职责：
 *   1. 元数据声明 — attributes / functions / children（声明"有什么"）
 *   2. 运行时委托 — attributeAccessor / functionRunner / childLister / instanceFinder（"如何执行"）
 *   3. 协议级校验 — fail-fast 构造 / JSON Schema 校验 / JSON 值规整 / 错误结果工厂
 *
 * LLM 执行流程（时序）：
 *   describeKind（获取能力清单）
 *   → listChildren / findInstance（探索实例树）
 *   → getAttribute / setAttribute / invokeFunction（读写属性、执行业务函数）
 *
 * 文件结构（按功能区域：辅助准备 → 核心 class → 数据清洗 → 错误报告）：
 *   一、内部辅助            — 仅 class 内部使用的类型和默认值
 *   二、AiModule class    — 协议核心（构造 + 元数据查询 + 协议方法 + 受保护辅助）
 *   三、规范化函数          — 构造期调用，fail-fast 清洗输入数据
 *   四、错误结果工厂        — 按协议方法分组，统一构造失败结果
 */

import {
  AiJsonSchemaValidator,
  coerceJsonValue,
  type AiJsonParams,
  type AiJsonValue,
  type AiJsonValidationIssue,
  type AiJsonValidationResult,
} from '../../json'
import type {
  AiModuleFunctionMetadata,
  AiModuleAttributeMetadata,
  AiModuleOptions,
  AiModuleConstructorMetadata,
  AiModulePayloadMetadata,
} from './module-metadata'
import type {
  AiModuleAttributeAccessor,
  AiModuleChildrenLister,
  AiModuleInstanceFinder,
  AiModuleInstanceQuery,
  AiModuleInstanceRef,
  AiModuleOperation,
  AiModuleRunner,
  AiModuleScriptContextProvider,
  AiModulePathContext,
} from './module-context'
import { AiModuleCheck, AiModuleResult } from './module-operation'

// ============================================================================
// 一、内部辅助（仅 class 内部使用，不对外暴露）
//
// 本节的类型和常量是 AiModule class 的"私有基础设施"：
//   ModuleFunctionServiceResult — 业务方 service 返回的原始格式，由 serviceResultToOperationResult 投影
//   RequiredTextListOptions     — 字符串列表规范化入参，集中处理 trim/去重/自定义校验
//   EMPTY_ATTRIBUTE_ACCESSOR    — 未声明 attributes 时的默认属性委托（安全兜底）
// ============================================================================

/**
   * 业务方 service 可返回的原始格式。
 * 由 serviceResultToOperationResult 投影为标准 AiModuleResult。
 *
 * 成功分支：{ ok: true, data?: unknown, summary?: string }
 *   其中 summary 会转为 info 级 check，供 LLM 阅读操作摘要。
 * 失败分支：{ ok: false, code: string, msg: string, fix?: string }
 *   其中 code/msg/fix 会转为 error 级 check，供 LLM 分支处理。
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

/**
 * 默认属性访问委托。未声明 attributes 时使用，安全兜底。
 * 所有操作均返回明确的错误信息，告知调用方需要注册 attributeAccessor。
 */
const EMPTY_ATTRIBUTE_ACCESSOR: AiModuleAttributeAccessor = {
  get: () => AiModuleResult.failCode(
    'ATTRIBUTE_ACCESSOR_NOT_REGISTERED',
    'AiModule 未注册属性访问委托',
    '声明 attributes 时必须在 AiModule 构造期提供 attributeAccessor。',
  ),
  set: () => AiModuleResult.failCode(
    'ATTRIBUTE_ACCESSOR_NOT_REGISTERED',
    'AiModule 未注册属性访问委托',
    '声明 attributes 时必须在 AiModule 构造期提供 attributeAccessor。',
  ),
}

const EMPTY_CHILD_LISTER: AiModuleChildrenLister = () => AiModuleResult.failCode(
  'CHILD_LISTER_NOT_REGISTERED',
  'AiModule 未注册子实例列表委托',
  '声明 children 时必须在 AiModule 构造期提供 list 委托。',
)

const EMPTY_INSTANCE_FINDER: AiModuleInstanceFinder = () => AiModuleResult.failCode(
  'INSTANCE_FINDER_NOT_REGISTERED',
  '该 kind 不支持实例 path 寻址',
  '根实例由会话 scope 钉死；子模型通过 module_script 对象链进入。请改用 module_query/module_guide 与 module_script。',
)

// ============================================================================
// 二、AiModule class
//
// 协议核心类。实例化采用三阶段构造：规范化元数据 → 必填校验 → 填充默认委托。
// 所有协议方法返回 Promise<AiModuleResult<T>>，兼容同步和异步委托。
// JSON Schema 校验统一由 AiJsonSchemaValidator 完成，错误结果由第四节工厂统一构造。
//
// class 内部按功能分为 5 个区块：
//   字段声明 → 构造函数 → 元数据查询 → 协议方法（属性/函数/子实例） → 受保护辅助 + 静态工具
// ============================================================================

export class AiModule {
  // ── 字段 ──

  // 元数据（公开只读，构造后不可变，LLM 通过 describeKind 查看）
  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly constructorSignature?: AiModuleConstructorMetadata
  public readonly parentKind?: string
  public readonly attributes: readonly AiModuleAttributeMetadata[]
  public readonly functions: readonly AiModuleFunctionMetadata[]
  public readonly payloads: readonly AiModulePayloadMetadata[]
  public readonly children: readonly string[]

  // name → metadata 索引（O(1) Map 查找，避免数组遍历。仅内部 + Navigator 使用）
  private readonly moduleAttributeByName: ReadonlyMap<string, AiModuleAttributeMetadata>
  private readonly moduleFunctionByName: ReadonlyMap<string, AiModuleFunctionMetadata>

  // 运行时委托（构造后不可变，每个委托对应一类运行时操作）
  private readonly attributeAccessor: AiModuleAttributeAccessor
  private readonly functionRunner: AiModuleRunner
  private readonly scriptContextProvider: AiModuleScriptContextProvider | undefined
  private readonly childLister: AiModuleChildrenLister
  private readonly instanceFinder: AiModuleInstanceFinder

  // ── 构造函数（三阶段：规范化元数据 → 必填校验 → 填充默认委托）──

  /**
   * 三阶段构造：
   *
   *   第一阶段 — 规范化元数据（trim 空白 + 浅/深拷贝防外部污染 + 校验重复 name/自引用）
   *     所有字符串字段经过 normalizeRequiredText trim 处理，空字符串直接抛错。
   *     attributes/functions/children 逐一深拷贝并构建索引 Map。
   *
   *   第二阶段 — 属性委托必填校验
   *     如果声明了 attributes（长度 > 0），但没有提供 attributeAccessor，构造期直接抛错。
   *     这是 fail-fast 策略：声明了属性就必须提供读写能力。
   *
   *   第三阶段 — 填充默认委托
   *     对于未提供的委托，使用安全默认值：
   *       attributeAccessor → EMPTY_ATTRIBUTE_ACCESSOR（返回明确错误）
   *       runner           → functionNotImplemented（返回 FUNCTION_NOT_IMPLEMENTED）
   *       list             → 空列表
   *       find             → 仅当 childKind===自身kind 且非路径查询时返回当前实例
   */
  public constructor(options: AiModuleOptions) {
    // 【第一阶段】规范化元数据（trim + fail-fast）
    const kind = normalizeRequiredText(options.kind, 'kind')
    this.kind = kind
    this.name = normalizeRequiredText(options.name, `name for "${kind}"`)
    this.description = normalizeRequiredText(options.description, `description for "${kind}"`)
    if (options.constructorSignature !== undefined) {
      this.constructorSignature = options.constructorSignature
    }
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

    // 【第二阶段】运行委托必填校验
    // 属性元数据可仅用于 module_guide/module_attribute_guide；真正读写时若未注册委托，
    // EMPTY_ATTRIBUTE_ACCESSOR 会返回明确的 ATTRIBUTE_ACCESSOR_NOT_REGISTERED。
    const hasFunctionRunner = options.runner !== undefined || this.runFunction !== AiModule.prototype.runFunction
    if (this.functions.length > 0 && !hasFunctionRunner) {
      throw new Error(`runner for "${kind}" is required when functions are declared`)
    }
    if (this.children.length > 0 && options.list === undefined) {
      throw new Error(`list for "${kind}" is required when children are declared`)
    }
    if (this.children.length > 0 && options.find === undefined) {
      throw new Error(`find for "${kind}" is required when children are declared`)
    }

    // 【第三阶段】填充默认委托
    this.attributeAccessor = options.attributeAccessor ?? EMPTY_ATTRIBUTE_ACCESSOR
    this.functionRunner = options.runner ?? ((_ctx, functionName) => functionNotImplemented(this.kind, functionName))
    this.scriptContextProvider = options.scriptContext
    this.childLister = options.list ?? EMPTY_CHILD_LISTER
    this.instanceFinder = options.find ?? EMPTY_INSTANCE_FINDER
  }

  // ── 元数据查询（O(1) Map 查找，供 Navigator 和 internal 校验使用）──

  /** 按 name 查找属性元数据。Navigator 和 getAttribute/setAttribute 内部校验使用。 */
  public findAttribute(attrName: string): AiModuleAttributeMetadata | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  /** 按 name 查找函数元数据。Navigator、describeKind 和 invokeFunction 内部校验使用。 */
  public findFunction(functionName: string): AiModuleFunctionMetadata | undefined {
    return this.moduleFunctionByName.get(functionName)
  }

  /** 构造 module_script 的能力提供方上下文；无委托时返回空对象。 */
  public createScriptContext(ctx: AiModulePathContext): Readonly<Record<string, unknown>> {
    return this.scriptContextProvider?.(ctx) ?? {}
  }

  /** 导出当前运行时选项，供 inspect 拓扑合并等内部重建使用。 */
  public toRuntimeOptions(): AiModuleOptions {
    return {
      kind: this.kind,
      name: this.name,
      description: this.description,
      ...(this.constructorSignature === undefined ? {} : { constructorSignature: this.constructorSignature }),
      ...(this.parentKind === undefined ? {} : { parentKind: this.parentKind }),
      ...(this.attributes.length === 0 ? {} : { attributes: this.attributes }),
      ...(this.functions.length === 0 ? {} : { functions: this.functions }),
      ...(this.payloads.length === 0 ? {} : { payloads: this.payloads }),
      ...(this.children.length === 0 ? {} : { children: this.children }),
      attributeAccessor: this.attributeAccessor,
      runner: this.functionRunner,
      ...(this.scriptContextProvider === undefined ? {} : { scriptContext: this.scriptContextProvider }),
      list: this.childLister,
      find: this.instanceFinder,
    }
  }

  // ── 协议方法 · 属性读取 ──
  //
  // 5 步校验链，每步失败均有明确的错误码返回给 LLM：
  //   步骤 1：声明校验   → attrName 在 attributes 表中？（否则 ATTRIBUTE_NOT_DECLARED）
  //   步骤 2：可读校验   → readable === true？（否则 ATTRIBUTE_NOT_READABLE）
  //   步骤 3：委托读取   → attributeAccessor.get(ctx, attrName)（失败则透传）
  //   步骤 4：JSON 序列化 → data → coerceJsonValue → AiJsonValue（否则 ATTRIBUTE_VALUE_NOT_JSON）
  //   步骤 5：schema 校验 → validateJsonValue(value, attr.schema)（否则 SCHEMA_VALIDATION_FAILED）

  public async getAttribute(
    ctx: AiModulePathContext,
    attrName: string,
  ): Promise<AiModuleResult<AiJsonValue>> {
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
        return AiModuleResult.passthroughFailure(result)
      }
      if (result.data === undefined) {
        return AiModuleResult.failCode(
          'ATTRIBUTE_VALUE_NOT_FOUND',
          `${this.kind} 属性 "${attrName}" 未设置`,
          '请确认 AiModule 构造期 attributeAccessor 能返回该属性值。',
        )
      }

      const value = coerceJsonValue(result.data)
      if (value === undefined) {
        return AiModuleResult.failCode(
          'ATTRIBUTE_VALUE_NOT_JSON',
          `${this.kind} 属性 "${attrName}" 不是可序列化 JSON 值`,
          '请把属性值保持为字符串、数字、布尔、null、数组或普通对象。',
        )
      }

      const validation: AiJsonValidationResult = AiJsonSchemaValidator.validateJsonValue(value, attr.schema)
      if (!validation.ok) {
        return schemaValidationFailed(
          `${this.kind}.${attrName} 属性值`,
          validation.issues,
          `请调用 module_attribute_guide({ kind: "${this.kind}", attrName: "${attrName}" }) 读取 schema 后修正属性值。`,
        )
      }
      return AiModuleResult.ok(value)
    } catch (error: unknown) {
      return attributeReadFailed(this.kind, attrName, error)
    }
  }

  // ── 协议方法 · 属性写入 ──
  //
  // 4 步校验链（写入比读取少一步 JSON 序列化，因为入参已经是 AiJsonValue）：
  //   步骤 1：声明校验   → attrName 在 attributes 表中？（否则 ATTRIBUTE_NOT_DECLARED）
  //   步骤 2：可写校验   → writable === true？（否则 ATTRIBUTE_NOT_WRITABLE）
  //   步骤 3：schema 校验 → validateJsonValue(value, attr.schema)（否则 SCHEMA_VALIDATION_FAILED）
  //   步骤 4：委托写入   → attributeAccessor.set(ctx, attrName, value)（异常则 ATTRIBUTE_WRITE_FAILED）

  public async setAttribute(
    ctx: AiModulePathContext,
    attrName: string,
    value: AiJsonValue,
  ): Promise<AiModuleResult<void>> {
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return attributeNotDeclared(this.kind, attrName)
    }
    if (!attr.writable) {
      return attributeNotWritable(this.kind, attrName)
    }

    const validation = AiJsonSchemaValidator.validateJsonValue(value, attr.schema)
    if (!validation.ok) {
      return schemaValidationFailed(
        `${this.kind}.${attrName} 属性写入值`,
        validation.issues,
        `请调用 module_attribute_guide({ kind: "${this.kind}", attrName: "${attrName}" }) 读取 schema 后修正 value。`,
      )
    }

    try {
      const result = await this.attributeAccessor.set(ctx, attrName, value)
      if (!result.ok) {
        return AiModuleResult.passthroughFailure(result)
      }
      return AiModuleResult.ok<void>()
    } catch (error: unknown) {
      return attributeWriteFailed(this.kind, attrName, error)
    }
  }

  // ── 协议方法 · 函数调用 ──
  //
  // 3 步校验链：
  //   步骤 1：声明校验       → functionName 在 functions 表中？（否则 FUNCTION_NOT_DECLARED）
  //   步骤 2：参数 schema 校验 → validateDeserializedParams(args, fn.paramsSchema)（否则 SCHEMA_VALIDATION_FAILED）
  //   步骤 3：委托执行       → runFunction(ctx, functionName, args)（异常则 FUNCTION_EXECUTE_ERROR）
  //
  // runFunction 是 protected 方法，子类可覆盖以添加拦截/日志/审计逻辑。

  public async invokeFunction(
    ctx: AiModulePathContext,
    functionName: string,
    args: AiJsonParams,
  ): Promise<AiModuleResult<AiJsonValue>> {
    const fn = this.findFunction(functionName)
    if (fn === undefined) {
      return functionNotDeclared(this.kind, functionName)
    }

    const validation = AiJsonSchemaValidator.validateDeserializedParams(args, fn.paramsSchema)
    if (!validation.ok) {
      return schemaValidationFailed(
        `${this.kind}.${functionName} 参数`,
        validation.issues,
        `请调用 module_function_guide({ kind: "${this.kind}", functionName: "${functionName}" }) 读取 paramsSchema、usageRules 和 failureModes 后重试。`,
      )
    }

    try {
      return await this.runFunction(ctx, functionName, args)
    } catch (error: unknown) {
      return functionExecuteError(error)
    }
  }

  /**
   * 受保护的 runner 入口。子类可覆盖以添加拦截/日志/审计逻辑。
   * 默认直接委托给构造期注入的 functionRunner。
   */
  protected runFunction(
    ctx: AiModulePathContext,
    functionName: string,
    args: AiJsonParams,
  ): AiModuleOperation<AiJsonValue> {
    return this.functionRunner(ctx, functionName, args)
  }

  // ── 协议方法 · 子实例操作 ──
  //
  // 三个方法对应三个委托，覆盖 LLM 探索模块树的全部操作：
  //   listChildren  — 列出子实例（委托 childLister，未提供时默认空列表）
  //   findInstance  — 按条件查询子实例（委托 instanceFinder）
  //   resolveChild  — 验证子实例是否存在（组合 children 声明 + findInstance）

  /** 列出子实例。可选 childKind 过滤，委托 childLister 执行。 */
  public listChildren(
    ctx: AiModulePathContext,
    childKind?: string,
  ): Promise<AiModuleResult<readonly AiModuleInstanceRef[]>> {
    return Promise.resolve(this.childLister(ctx, childKind))
  }

  /** 按条件查询子实例。委托 instanceFinder 执行，query 语义由委托实现解释。 */
  public findInstance(
    ctx: AiModulePathContext,
    childKind: string,
    query: AiModuleInstanceQuery,
  ): Promise<AiModuleResult<readonly AiModuleInstanceRef[]>> {
    return Promise.resolve(this.instanceFinder(ctx, childKind, query))
  }

  /**
   * 验证子实例是否存在于当前 children 声明中。
   * 流程：检查 children 声明表 → findInstance 精确查询 → 匹配目标 id。
   * 这是 Navigator 在路径解析时验证下一段有效性的核心方法。
   */
  public async resolveChild(
    ctx: AiModulePathContext,
    childKind: string,
    childId: string,
  ): Promise<AiModuleResult<boolean>> {
    if (!this.children.includes(childKind)) {
      return AiModuleResult.ok(false)
    }

    const found = await this.findInstance(ctx, childKind, { id: childId })
    if (!found.ok) {
      return AiModuleResult.passthroughFailure(found)
    }
    return AiModuleResult.ok((found.data ?? []).some((ref) => ref.id === childId))
  }

  // ── 受保护辅助方法（子类可复用）──

  /** 从 host 上下文提取当前实例引用（供默认 find 实现 + 子类使用） */
  protected createCurrentInstanceRef(ctx: AiModulePathContext): AiModuleInstanceRef | null {
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

  /**
   * 将业务方 { ok, data/code/msg/fix } 格式投影为标准 AiModuleResult。
   * 这是业务 service 与协议层之间的适配器：
   *   成功时 summary → info 级 check（LLM 可阅读操作摘要）
   *   失败时 code/msg/fix → error 级 check（LLM 可据此分支修复）
   */
  protected serviceResultToOperationResult(result: ModuleFunctionServiceResult): AiModuleResult<AiJsonValue> {
    if (result.ok) {
      return AiModuleResult.ok(
        coerceJsonValue(result.data),
        result.summary === undefined ? undefined : [AiModuleCheck.info('OK', result.summary)],
      )
    }
    return AiModuleResult.failCode(result.code, result.msg, result.fix)
  }
}

// ============================================================================
// 三、规范化函数（构造期调用，fail-fast 策略）
//
// 本节函数在 AiModule 构造函数的第一阶段被调用。职责：
//   1. trim 空白 — 所有字符串字段经 normalizeRequiredText 处理，空字符串直接抛错
//   2. 浅/深拷贝 — 数组和嵌套对象使用展开运算符或 map 拷贝，防止外部修改污染内部状态
//   3. 校验去重 — 按 name/kind 等唯一键查重，重复即抛错
//   4. 自引用检测 — parentKind 和 children 不能指向自身
//
// 每个函数接收 ownKind 参数，用于生成可定位的错误消息（包含 kind 名 + 字段名）。
// 所有校验均为 fail-fast：首次遇到非法输入立即抛错，不做静默回退。
// ============================================================================

/** trim 后不得为空，否则直接抛错。所有字符串字段的基础清洗函数。 */
function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error(`${field} must not be empty`)
  }
  return normalized
}

/** 按 name 字段构建索引 Map。重复 name 直接抛错，保证 O(1) 查找且无歧义。 */
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

/** 对每条属性元数据：trim name/description，浅拷贝其余字段。保留 example 仅当非 undefined。 */
function normalizeAttributeMetadata(
  attributes: readonly AiModuleAttributeMetadata[],
  ownKind: string,
): readonly AiModuleAttributeMetadata[] {
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
    ...(attribute.api === undefined
      ? {}
      : { api: {
        kind: attribute.api.kind,
        name: attribute.api.name,
        description: attribute.api.description,
        actions: attribute.api.actions.map(action => ({
          name: action.name,
          description: action.description,
          paramNames: [...action.paramNames],
        })),
      } }),
  }))
}

// ── 函数元数据规范化 ──

/** 对每条函数元数据：trim name/description，深拷贝 usageRules/failureModes 数组防外部污染。 */
function normalizeFunctionMetadata(
  functions: readonly AiModuleFunctionMetadata[],
  ownKind: string,
): readonly AiModuleFunctionMetadata[] {
  return functions.map((fn) => ({
    name: normalizeRequiredText(fn.name, `function name for "${ownKind}"`),
    description: normalizeRequiredText(
      fn.description,
      `function "${fn.name}" description for "${ownKind}"`,
    ),
    paramsSchema: fn.paramsSchema,
    ...(fn.directCallable === undefined ? {} : { directCallable: fn.directCallable }),
    ...(fn.resultSchema === undefined ? {} : { resultSchema: fn.resultSchema }),
    ...(fn.resultApis === undefined ? {} : { resultApis: fn.resultApis.map(resultApi => ({
      resultPath: [...resultApi.resultPath],
      kind: resultApi.kind,
      name: resultApi.name,
      description: resultApi.description,
      actions: resultApi.actions.map(action => ({
        name: action.name,
        description: action.description,
        paramNames: [...action.paramNames],
      })),
    })) }),
    ...(fn.usageRules === undefined ? {} : { usageRules: [...fn.usageRules] }),
    ...(fn.requiredBeforeCall === undefined ? {} : { requiredBeforeCall: [...fn.requiredBeforeCall] }),
    ...(fn.failureModes === undefined
      ? {}
      : { failureModes: fn.failureModes.map((mode) => ({ ...mode })) }),
    ...(fn.example === undefined ? {} : { example: fn.example }),
    ...(fn.examples === undefined ? {} : { examples: fn.examples.map((example) => ({ ...example })) }),
    ...(fn.antiExamples === undefined
      ? {}
      : { antiExamples: fn.antiExamples.map((example) => ({ ...example })) }),
  }))
}

// ── 父子关系规范化 ──

/** parentKind 校验：拒绝空值（trim 后为空）和自引用（parentKind === ownKind） */
function normalizeParentKind(parentKind: string | undefined, ownKind: string): string | undefined {
  if (parentKind === undefined) return undefined
  const normalized = normalizeRequiredText(parentKind, `parentKind for "${ownKind}"`)
  if (normalized === ownKind) {
    throw new Error(`parentKind for "${ownKind}" must not point to itself`)
  }
  return normalized
}

/** children 列表校验：通过 normalizeRequiredUniqueTexts 统一处理 trim → validate（自引用检测）→ 去重 */
function normalizePayloadMetadata(
  payloads: readonly AiModulePayloadMetadata[],
  ownKind: string,
): readonly AiModulePayloadMetadata[] {
  const seen = new Set<string>()
  const out: AiModulePayloadMetadata[] = []
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
 * 处理顺序固定为：trim → 自定义校验(validate) → 去重。
 * 保证错误信息可定位（包含 field 名）且无静默回退（重复/空值均抛错）。
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
// 所有协议方法的失败路径最终都通过本节的工厂函数构造 AiModuleResult。
// 统一使用 AiModuleResult.failCode / fail 返回，每个函数对应一个明确的协议错误码。
// LLM 可通过错误码分支处理（如 ATTRIBUTE_NOT_DECLARED → 调用 module_guide/module_attribute_guide 查看属性表）。
//
// 分组（按校验链出现顺序）：
//   Schema 校验错误   — schemaValidationFailed
//   函数相关错误      — functionNotImplemented / functionNotDeclared / functionExecuteError
//   属性相关错误      — attributeNotDeclared / attributeNotReadable / attributeNotWritable
//                       attributeReadFailed / attributeWriteFailed
// ============================================================================

// ── Schema 校验错误 ──

/**
 * JSON Schema 校验失败。
 * 汇总所有 AiJsonValidationIssue 为两级 check：
 *   summary — 单条 error 级 check，包含所有问题的格式化摘要
 *   details — 每条 issue 一条 error 级 check，LLM 可知晓每个字段的具体问题
 */
function schemaValidationFailed(
  subject: string,
  issues: readonly AiJsonValidationIssue[],
  hint: string,
): AiModuleResult<never> {
  const summary = AiModuleCheck.error(
    'SCHEMA_VALIDATION_FAILED',
    `${subject} JSON Schema 校验失败: ${AiJsonSchemaValidator.formatAiJsonValidationIssues(issues)}`,
    hint,
  )
  const details = issues.map((issue) =>
    AiModuleCheck.error(
      'SCHEMA_VALIDATION_FAILED',
      `${issue.path} ${issue.message}`,
      hint,
    ),
  )
  return AiModuleResult.fail([summary, ...details])
}

// ── 函数相关错误 ──

/** 函数未实现：runner 未提供或不识别该 functionName。与 FUNCTION_NOT_DECLARED 的区别是声明存在但无实现。 */
function functionNotImplemented(kind: string, functionName: string): AiModuleResult<AiJsonValue> {
  return AiModuleResult.failCode(
    'FUNCTION_NOT_IMPLEMENTED',
    `${kind} 未注册函数 "${functionName}"`,
    '请检查该 AiModule 构造期 runner 委托是否实现了该 functionName。',
  )
}

/** 函数未声明：kind 的 functions 表中找不到该 functionName。LLM 应调用 module_query/module_function_guide 查看函数表和契约。 */
function functionNotDeclared(kind: string, functionName: string): AiModuleResult<never> {
  return AiModuleResult.failCode(
    'FUNCTION_NOT_DECLARED',
    `kind "${kind}" 未声明函数 "${functionName}"`,
    `调用 module_query({ kind: "${kind}", includeFunctions: true }) 查看真实函数名，再用 module_function_guide({ kind: "${kind}", functionName: "<真实函数名>" }) 查看函数契约；不要继续猜 functionName。`,
  )
}

// ── 属性相关错误 ──

/** 属性未声明：kind 的 attributes 表中找不到该 attrName。LLM 应调用 module_guide 查看属性目录。 */
function attributeNotDeclared(kind: string, attrName: string): AiModuleResult<never> {
  return AiModuleResult.failCode(
    'ATTRIBUTE_NOT_DECLARED',
    `kind "${kind}" 未声明属性 "${attrName}"`,
    `调用 module_guide({ kind: "${kind}" }) 查看真实 attrName，再用 module_attribute_guide({ kind: "${kind}", attrName: "<真实属性名>" }) 查看属性契约；不要继续猜 attrName。`,
  )
}

/** 属性不可读：已声明但 readable=false。LLM 应只读取 readable=true 的属性。 */
function attributeNotReadable(kind: string, attrName: string): AiModuleResult<never> {
  return AiModuleResult.failCode(
    'ATTRIBUTE_NOT_READABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可读`,
    `请只读取 readable=true 的属性；可调用 module_attribute_guide({ kind: "${kind}", attrName: "${attrName}" }) 查看属性权限。`,
  )
}

/** 属性不可写：已声明但 writable=false。LLM 应只写入 writable=true 的属性。 */
function attributeNotWritable(kind: string, attrName: string): AiModuleResult<never> {
  return AiModuleResult.failCode(
    'ATTRIBUTE_NOT_WRITABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可写`,
    `请只写入 writable=true 的属性；可调用 module_attribute_guide({ kind: "${kind}", attrName: "${attrName}" }) 查看属性权限。`,
  )
}

// ── 执行异常错误（委托抛出未捕获异常时统一包装）──

/** 属性读取异常：attributeAccessor.get 抛出未捕获异常时的兜底包装。 */
function attributeReadFailed(kind: string, attrName: string, error: unknown): AiModuleResult<never> {
  return AiModuleResult.failCode(
    'ATTRIBUTE_READ_FAILED',
    error instanceof Error ? error.message : `${kind} 属性 "${attrName}" 读取失败`,
    '检查 AiModule 构造期 attributeAccessor.get 实现。',
  )
}

/** 属性写入异常：attributeAccessor.set 抛出未捕获异常时的兜底包装。 */
function attributeWriteFailed(kind: string, attrName: string, error: unknown): AiModuleResult<never> {
  return AiModuleResult.failCode(
    'ATTRIBUTE_WRITE_FAILED',
    error instanceof Error ? error.message : `${kind} 属性 "${attrName}" 写入失败`,
    '检查 AiModule 构造期 attributeAccessor.set 实现。',
  )
}

/** 函数执行异常：functionRunner 抛出未捕获异常时的兜底包装。业务方应在委托内部自行捕获异常。 */
function functionExecuteError(error: unknown): AiModuleResult<AiJsonValue> {
  return AiModuleResult.failCode(
    'FUNCTION_EXECUTE_ERROR',
    error instanceof Error ? error.message : String(error),
    '检查函数 runner 实现；业务可捕获异常后返回更具体的 OperationResult。',
  )
}
