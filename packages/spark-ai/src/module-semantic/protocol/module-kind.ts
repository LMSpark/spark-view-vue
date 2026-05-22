/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/protocol/module-kind.ts — 模块语义协议核心
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】整个 spark-ai 协议栈的核心。ModuleKind 是唯一核心 class，
 *   描述一种业务模块的完整形状（属性 + 动作 + 子模块），也是通用语义运行入口。
 *   进程内每种 kind 一份，启动后冻结。
 *
 * 【设计决策】
 *   - ModuleKind 同时是"元数据描述"和"运行入口"，业务无需额外注册第二套对象。
 *   - 通过 runner/list/find 函数属性实现依赖注入，不绑定具体业务系统。
 *   - namespace 收敛所有附属类型（Path、OperationResult、上下文等），避免零散导出。
 *   - 属性读写直接操作 runner 函数对象的属性，利用 JS 函数即对象的特性。
 *   - 路径格式固定为 /<kind>[<id>]/<kind>[<id>]/...，以 / 开头。
 *
 * 【消费方】module-semantic/internal/*（全部 internal 组件）、
 *   module-semantic/runtime/*（运行时组合根）、
 *   所有业务 ModuleKind 子类（protocol-tool-catalog 等）
 *
 * ═══════════════════════════════════════════════════════════════
 * 文件结构：
 *
 *   第 1 节 · Attribute / Action schema 类型（顶层，class 构造参数）
 *   第 2 节 · ModuleKind class（协议核心，约 250 行）
 *   第 3 节 · ModuleKind namespace（附属类型：结果 / 路径 / 上下文 / 委托）
 *   第 4 节 · 内部 helper（不导出）
 * ═══════════════════════════════════════════════════════════════
 */

import type { LlmJsonObject, LlmJsonSchema, LlmJsonValue, LlmParameterSchemaRoot } from '../../schema'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · Attribute / Action schema — 元数据描述类型
// ═══════════════════════════════════════════════════════════════

/** 属性元数据：名称、描述、JSON Schema 类型、读写权限、示例 */
export type AttributeSchema = Readonly<{
  name: string
  description: string
  schema: LlmJsonSchema
  readable: boolean
  writable: boolean
  example?: LlmJsonValue | undefined
}>

/** 属性访问权限标记（从 AttributeSchema 中提取） */
export type AttributeAccessFlags = Pick<AttributeSchema, 'readable' | 'writable'>

/** 动作失败模式：code（错误码）、when（触发条件）、fix（修复建议） */
export type ActionFailureMode = Readonly<{
  code: string
  when: string
  fix: string
}>

/** 动作结果 schema（可简化为 boolean 或完整 JSON Schema） */
export type ActionResultSchema = LlmJsonSchema | LlmJsonObject

/**
 * 动作元数据：名称、描述、参数/结果 schema、使用规则、失败模式、示例。
 * paramsSchema 必须为 type=object 的 LlmParameterSchemaRoot。
 */
export type ActionSchema = Readonly<{
  name: string
  description: string
  paramsSchema: LlmParameterSchemaRoot
  resultSchema?: ActionResultSchema | undefined
  usageRules?: readonly string[] | undefined
  failureModes?: readonly ActionFailureMode[] | undefined
  example?: LlmJsonValue | undefined
}>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · ModuleKind class — 协议核心（class 必须在 namespace 之前）
// ═══════════════════════════════════════════════════════════════

/** runner 函数对象的属性存储载体类型 */
type ModuleKindRunnerProperties = Record<string, unknown>

const EMPTY_RUNNER_PROPERTIES: ModuleKindRunnerProperties = {}

/**
 * 业务 service 的动作返回值约定。
 * ok=true 时携带 data 和可选 summary；ok=false 时携带 code/msg/fix。
 */
type ModuleActionServiceResult =
  | { readonly ok: true; readonly data?: unknown; readonly summary?: string | undefined }
  | { readonly ok: false; readonly code: string; readonly msg: string; readonly fix?: string | undefined }

/**
 * 模块类型标准 class — 协议层唯一核心。
 *
 * 【职责】
 *   1. 持有 kind 的元数据（attributes / actions / children）
 *   2. 提供属性读写（getAttribute / setAttribute）
 *   3. 提供动作调用（invokeAction → runner 委托）
 *   4. 提供子实例发现（listChildren / findInstance / resolveChild → list/find 委托）
 *
 * 【委托模式】
 *   - runner: 业务注入的动作执行函数，签名 (ctx, actionName, args) → OperationResult
 *   - list:   业务注入的子实例列表函数
 *   - find:   业务注入的子实例查找函数
 *   - 基类提供默认实现（actionNotImplemented / 空列表 / 自引用）
 *
 * 【使用示例】
 * ```ts
 * const schoolKind = new ModuleKind({
 *   kind: 'school',
 *   name: '学校',
 *   description: '一所学校',
 *   attributes: [
 *     { name: 'name', description: '校名', schema: { type: 'string' }, readable: true, writable: true },
 *   ],
 *   actions: [],
 *   children: ['grade', 'teacher'],
 * })
 * ```
 */
export class ModuleKind {
  // ── 元数据（构造时冻结）──────────────────────────────────

  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly attributes: readonly AttributeSchema[]
  public readonly actions: readonly ActionSchema[]
  public readonly children: readonly string[]

  /** 按 name 索引的 attribute 速查表 */
  private readonly moduleAttributeByName: ReadonlyMap<string, AttributeSchema>
  /** 按 name 索引的 action 速查表 */
  private readonly moduleActionByName: ReadonlyMap<string, ActionSchema>

  // ── 委托函数（业务注入）──────────────────────────────────

  /** 动作执行委托：由业务方注入，接收 ctx + actionName + args */
  public runner: ModuleKind.Runner
  /** 子实例列表委托：由业务方注入 */
  public list: ModuleKind.ChildrenLister
  /** 子实例查找委托：由业务方注入 */
  public find: ModuleKind.InstanceFinder

  // ── 构造器 ──────────────────────────────────────────────

  public constructor(options: {
    readonly kind: string
    readonly name: string
    readonly description: string
    readonly attributes?: readonly AttributeSchema[] | undefined
    readonly actions?: readonly ActionSchema[] | undefined
    readonly children?: readonly string[] | undefined
    readonly runner?: ModuleKind.Runner | undefined
    readonly list?: ModuleKind.ChildrenLister | undefined
    readonly find?: ModuleKind.InstanceFinder | undefined
  }) {
    this.kind = options.kind
    this.name = options.name
    this.description = options.description
    this.attributes = normalizeAttributeSchemas(options.attributes ?? [])
    this.moduleAttributeByName = createNamedMap(this.attributes, 'attribute')
    this.actions = normalizeActionSchemas(options.actions ?? [])
    this.moduleActionByName = createNamedMap(this.actions, 'action')
    this.children = options.children ?? []

    // 委托注入：未提供的使用默认实现
    this.runner = options.runner ?? ((_ctx, actionName) => actionNotImplemented(this.kind, actionName))
    this.list = options.list ?? (() => ModuleKind.OperationResult.ok<readonly ModuleKind.InstanceRef[]>([]))
    this.find = options.find ?? ((ctx, childKind) => {
      if (childKind !== this.kind || ctx.segments.length !== 0) {
        return ModuleKind.OperationResult.ok<readonly ModuleKind.InstanceRef[]>([])
      }
      const ref = this.createCurrentInstanceRef(ctx)
      return ModuleKind.OperationResult.ok<readonly ModuleKind.InstanceRef[]>(ref === null ? [] : [ref])
    })
  }

  // ── 查询方法 ────────────────────────────────────────────

  /** 按名称查找属性元数据 */
  public findAttribute(attrName: string): AttributeSchema | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  /** 按名称查找动作元数据 */
  public findAction(actionName: string): ActionSchema | undefined {
    return this.moduleActionByName.get(actionName)
  }

  // ── 属性读写（协议工具 getAttribute / setAttribute 的最终执行点）──

  /**
   * 读取属性。
   * 流程：查元数据 → 校验 readable → 从 runner 函数对象取值 → 投影为 LlmJsonValue。
   *
   * 失败码：ATTRIBUTE_NOT_DECLARED / ATTRIBUTE_NOT_READABLE /
   *         ATTRIBUTE_VALUE_NOT_FOUND / ATTRIBUTE_VALUE_NOT_JSON
   */
  public getAttribute(
    _ctx: ModuleKind.PathContext,
    attrName: string,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return Promise.resolve(attributeNotDeclared(this.kind, attrName))
    }
    if (!attr.readable) {
      return Promise.resolve(attributeNotReadable(this.kind, attrName))
    }

    const rawValue = runnerProperties(this.runner)[attrName]
    if (rawValue === undefined) {
      return Promise.resolve(ModuleKind.OperationResult.failCode(
        'ATTRIBUTE_VALUE_NOT_FOUND',
        `${this.kind}.runner 未设置属性 "${attrName}"`,
        '请确认 ModuleKind.runner 函数对象上已设置该属性。',
      ))
    }

    const value = ModuleKind.coerceJsonValue(rawValue)
    if (value === undefined) {
      return Promise.resolve(ModuleKind.OperationResult.failCode(
        'ATTRIBUTE_VALUE_NOT_JSON',
        `${this.kind}.runner 属性 "${attrName}" 不是可序列化 JSON 值`,
        '请把 runner 属性值保持为字符串、数字、布尔、null、数组或普通对象。',
      ))
    }
    return Promise.resolve(ModuleKind.OperationResult.ok(value))
  }

  /**
   * 写入属性。
   * 流程：查元数据 → 校验 writable → 写入 runner 函数对象属性。
   *
   * 失败码：ATTRIBUTE_NOT_DECLARED / ATTRIBUTE_NOT_WRITABLE / ATTRIBUTE_WRITE_FAILED
   */
  public setAttribute(
    _ctx: ModuleKind.PathContext,
    attrName: string,
    value: LlmJsonValue,
  ): Promise<ModuleKind.OperationResult<void>> {
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
      return Promise.resolve(ModuleKind.OperationResult.failCode(
        'ATTRIBUTE_WRITE_FAILED',
        `${this.kind}.runner 属性 "${attrName}" 写入失败`,
        '请确认 runner 函数对象允许写入该属性。',
      ))
    }
    return Promise.resolve(ModuleKind.OperationResult.ok<void>())
  }

  // ── 动作调用（协议工具 invokeAction 的最终执行点）───────

  /**
   * 调用动作。
   * 委托 runner(ctx, actionName, args)，异常自动包装为 ACTION_EXECUTE_ERROR。
   */
  public async invokeAction(
    ctx: ModuleKind.PathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<ModuleKind.OperationResult<LlmJsonValue>> {
    try {
      return await this.runner(ctx, actionName, args)
    } catch (error) {
      return actionExecuteError(error)
    }
  }

  // ── 子实例发现（协议工具 listChildren / findInstance 的最终执行点）──

  /** 列出子实例。委托 list(ctx, childKind)。 */
  public listChildren(
    ctx: ModuleKind.PathContext,
    childKind?: string,
  ): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return Promise.resolve(this.list(ctx, childKind))
  }

  /** 查询子实例。委托 find(ctx, childKind, query)。 */
  public findInstance(
    ctx: ModuleKind.PathContext,
    childKind: string,
    query: ModuleKind.InstanceQuery,
  ): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return Promise.resolve(this.find(ctx, childKind, query))
  }

  /**
   * 验证子实例存在性。
   * 先 find、后 list，任一命中即返回 true；两者都失败时透传失败原因。
   */
  public resolveChild(
    ctx: ModuleKind.PathContext,
    childKind: string,
    childId: string,
  ): Promise<ModuleKind.OperationResult<boolean>> {
    return this.resolve(ctx, childKind, childId)
  }

  // ── protected 辅助方法（供子类使用）─────────────────────

  /** 从 HostContext 创建当前实例引用 */
  protected createCurrentInstanceRef(ctx: ModuleKind.PathContext): ModuleKind.InstanceRef | null {
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

  /** 快捷构造成功的 OperationResult<LlmJsonValue> */
  protected okJson(data?: unknown, checks?: readonly ModuleKind.CheckEntry[]): ModuleKind.OperationResult<LlmJsonValue> {
    const json = ModuleKind.coerceJsonValue(data)
    return ModuleKind.OperationResult.ok(json, checks)
  }

  /** 快捷构造失败的 OperationResult<LlmJsonValue> */
  protected failJson(code: string, message: string, hint?: string): ModuleKind.OperationResult<LlmJsonValue> {
    return ModuleKind.OperationResult.failCode(code, message, hint)
  }

  /** 将业务 service 的 ModuleActionServiceResult 转为 OperationResult */
  protected serviceResultToOperationResult(result: ModuleActionServiceResult): ModuleKind.OperationResult<LlmJsonValue> {
    if (result.ok) {
      return this.okJson(
        result.data,
        result.summary === undefined ? undefined : [ModuleKind.CheckEntry.info('OK', result.summary)],
      )
    }
    return this.failJson(result.code, result.msg, result.fix)
  }

  // ── 公开静态工具 ───────────────────────────────────────

  /**
   * 将任意值安全投影为 LlmJsonValue。
   *
   * 支持 string / number / boolean / null / Array / Set / Map / 普通 object。
   * 不可序列化值（function、symbol、undefined 等）返回 undefined。
   * 递归处理嵌套结构，Set 展开为数组，Map 展开为普通对象。
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

  // ── 私有方法 ────────────────────────────────────────────

  /**
   * 子实例解析核心逻辑。
   * 先 find（精确匹配），再 list（遍历匹配）。
   */
  private async resolve(
    ctx: ModuleKind.PathContext,
    childKind: string,
    childId: string,
  ): Promise<ModuleKind.OperationResult<boolean>> {
    if (!this.children.includes(childKind)) {
      return ModuleKind.OperationResult.ok(false)
    }

    const found = await this.find(ctx, childKind, { id: childId })
    if (!found.ok) {
      return passthroughFailure(found)
    }
    if ((found.data ?? []).some((ref) => ref.id === childId)) {
      return ModuleKind.OperationResult.ok(true)
    }

    const listed = await this.list(ctx, childKind)
    if (!listed.ok) {
      return passthroughFailure(listed)
    }
    return ModuleKind.OperationResult.ok((listed.data ?? []).some((ref) => ref.id === childId))
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · ModuleKind namespace — 所有附属类型
//
// 使用 namespace 与 class 合并声明，消费方既可用 ModuleKind 构造实例，
// 也可用 ModuleKind.Path / ModuleKind.OperationResult 引用附属类型。
// ═══════════════════════════════════════════════════════════════

export namespace ModuleKind {
  // ── 3.1 操作结果 ────────────────────────────────────────

  /** CheckEntry 级别：error（阻断）/ warn（警告）/ info（信息） */
  export type CheckEntryLevel = 'error' | 'warn' | 'info'

  /**
   * 操作检查项。
   * 一次操作可产生多条 CheckEntry，按 level 区分严重程度。
   */
  export class CheckEntry {
    public constructor(
      public readonly level: CheckEntryLevel,
      public readonly code: string,
      public readonly message: string,
      public readonly hint?: string | undefined,
    ) {}

    public static error(code: string, message: string, hint?: string): CheckEntry {
      return new CheckEntry('error', code, message, hint)
    }

    public static warn(code: string, message: string, hint?: string): CheckEntry {
      return new CheckEntry('warn', code, message, hint)
    }

    public static info(code: string, message: string, hint?: string): CheckEntry {
      return new CheckEntry('info', code, message, hint)
    }
  }

  /**
   * 操作结果 — 协议层统一的返回值类型。
   *
   * 成功：ok=true, data 携带业务数据, checks 可含 warn/info
   * 失败：ok=false, checks 至少含一条 error
   *
   * 约定：fail() 要求至少一条 CheckEntry，防止无信息失败。
   */
  export class OperationResult<TData = unknown> {
    public readonly ok: boolean
    public readonly data?: TData | undefined
    public readonly checks?: readonly CheckEntry[] | undefined
    public readonly state?: Record<string, unknown> | undefined

    public constructor(options: OperationResult<TData>) {
      this.ok = options.ok
      this.data = options.data
      this.checks = nonEmptyChecks(options.checks)
      this.state = options.state
    }

    /** 构造成功结果 */
    public static ok<TData>(
      data?: TData,
      checks?: readonly CheckEntry[],
      state?: Record<string, unknown>,
    ): OperationResult<TData> {
      return new OperationResult({ ok: true, data, checks, state })
    }

    /** 构造失败结果（要求至少一条 error check） */
    public static fail(
      checks: readonly CheckEntry[],
      state?: Record<string, unknown>,
    ): OperationResult<never> {
      if (checks.length === 0) {
        throw new Error('OperationResult.fail requires at least one CheckEntry')
      }
      return new OperationResult({ ok: false, checks, state })
    }

    /** 快捷构造单 error 失败结果 */
    public static failCode(code: string, message: string, hint?: string): OperationResult<never> {
      return OperationResult.fail([CheckEntry.error(code, message, hint)])
    }

    /** 透传另一个失败结果的 checks/state，保持失败链可追溯 */
    public static passthroughFailure(result: OperationResult<unknown>): OperationResult<never> {
      return new OperationResult({ ok: false, checks: result.checks, state: result.state })
    }
  }

  // ── 3.2 模块路径 — 不可变值对象 ─────────────────────────

  export type PathParseErrorCode =
    | 'EMPTY'
    | 'MISSING_LEADING_SLASH'
    | 'INVALID_SEGMENT'
    | 'EMPTY_KIND'
    | 'EMPTY_ID'

  /** 路径解析错误，携带错误码、原始输入、位置信息 */
  export class PathParseError extends Error {
    public constructor(
      public readonly code: PathParseErrorCode,
      public readonly raw: string,
      message: string,
      public readonly position?: number | undefined,
    ) {
      super(message)
      this.name = 'ModulePathParseError'
    }
  }

  /**
   * 路径段：kind[id]。
   * kind 是模块类型名，id 是实例标识。
   */
  export class PathSegment {
    public constructor(
      public readonly kind: string,
      public readonly id: string,
    ) {}

    /** 校验并创建路径段（kind 和 id 均不可为空） */
    public static from(segment: PathSegment, raw = '', index = 0): PathSegment {
      if (segment.kind.length === 0) {
        throw new PathParseError('EMPTY_KIND', raw, `segment[${String(index)}] has empty kind`)
      }
      if (segment.id.length === 0) {
        throw new PathParseError('EMPTY_ID', raw, `segment[${String(index)}] has empty id`)
      }
      return new PathSegment(segment.kind, segment.id)
    }
  }

  /**
   * 模块路径 — 不可变值对象。
   *
   * 路径永远以 / 开头。根路径序列化为 "/"。
   *
   * 构造方式：
   *   - ModuleKind.Path.parse('/school[jianguo]/grade[g3]')  显式解析
   *   - ModuleKind.Path.of([{kind:'school', id:'jianguo'}, ...])  按段构造
   *   - ModuleKind.Path.root()  根路径（无段）
   */
  export class Path {
    public readonly segments: readonly PathSegment[]

    private constructor(segments: readonly PathSegment[]) {
      this.segments = segments
    }

    public static root(): Path {
      return new Path([])
    }

    public static of(segments: readonly PathSegment[]): Path {
      return new Path(segments.map((seg, index) => PathSegment.from(seg, '', index)))
    }

    /** 解析路径字符串。格式：/ 或 /<kind>[<id>]/<kind>[<id>]/... */
    public static parse(raw: string): Path {
      if (raw.length === 0) {
        throw new PathParseError('EMPTY', raw, 'path is empty')
      }
      if (!raw.startsWith('/')) {
        throw new PathParseError('MISSING_LEADING_SLASH', raw, 'path must start with "/"', 0)
      }
      if (raw === '/') {
        return Path.root()
      }
      const rawSegments = splitRawSegments(raw)
      const segments: PathSegment[] = []
      let cursor = 1
      for (const part of rawSegments) {
        const seg = parseSegment(part, raw, cursor)
        segments.push(seg)
        cursor += part.length + 1
      }
      return new Path(segments)
    }

    /** 是否为根路径（无段） */
    public get isRoot(): boolean {
      return this.segments.length === 0
    }

    /** 路径深度（段数） */
    public get depth(): number {
      return this.segments.length
    }

    /** 末尾段，根路径时返回 undefined */
    public get tail(): PathSegment | undefined {
      return this.segments.length === 0 ? undefined : this.segments[this.segments.length - 1]
    }

    /** 返回父路径（去掉末尾段），根路径返回自身 */
    public parent(): Path {
      if (this.segments.length === 0) return this
      return new Path(this.segments.slice(0, -1))
    }

    /** 追加一段，返回新 Path（不可变） */
    public append(segment: PathSegment): Path {
      if (segment.kind.length === 0) {
        throw new PathParseError('EMPTY_KIND', this.toString(), 'cannot append segment with empty kind')
      }
      if (segment.id.length === 0) {
        throw new PathParseError('EMPTY_ID', this.toString(), 'cannot append segment with empty id')
      }
      return new Path([...this.segments, PathSegment.from(segment, this.toString(), this.segments.length)])
    }

    /** 序列化为 /<kind>[<id>]/<kind>[<id>]/... */
    public toString(): string {
      if (this.segments.length === 0) return '/'
      return this.segments.map((seg) => `/${seg.kind}[${seg.id}]`).join('')
    }

    /** 值相等比较（逐段比较 kind 和 id） */
    public equals(other: Path): boolean {
      if (this.segments.length !== other.segments.length) return false
      return this.segments.every((seg, index) => {
        const otherSeg = other.segments[index]
        return seg.kind === otherSeg?.kind && seg.id === otherSeg.id
      })
    }
  }

  // ── 3.3 上下文 / 实例引用 / 委托类型 ────────────────────

  /**
   * Host 注入的上下文。
   * moduleId: 业务注册 ID（如 'pageDesign'）
   * moduleInstanceId: 业务实例 ID（如当前页面 ID）
   * instanceId: 会话隔离 key
   */
  export type HostContext = Readonly<{
    moduleId: string
    moduleInstanceId: string
    instanceId: string
  }>

  /**
   * 路径上下文。
   * segments: 完整路径段列表
   * segment:  当前（末段）路径段
   * host:     Host 注入的上下文（可选）
   */
  export type PathContext = Readonly<{
    segments: readonly PathSegment[]
    segment: PathSegment
    host?: HostContext | undefined
  }>

  /** 实例引用：id + 展示标签 + 可选摘要 */
  export type InstanceRef = Readonly<{
    id: string
    label: string
    summary?: string | undefined
  }>

  /** 实例查询条件（由业务 find 委托自行解释） */
  export type InstanceQuery = Readonly<Record<string, LlmJsonValue>>

  /** 操作：同步或异步返回 OperationResult */
  export type Operation<TData> = OperationResult<TData> | Promise<OperationResult<TData>>

  /** 动作执行委托签名 */
  export type Runner = (
    ctx: PathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ) => Operation<LlmJsonValue>

  /** 子实例列表委托签名 */
  export type ChildrenLister = (
    ctx: PathContext,
    childKind?: string,
  ) => Operation<readonly InstanceRef[]>

  /** 子实例查找委托签名 */
  export type InstanceFinder = (
    ctx: PathContext,
    childKind: string,
    query: InstanceQuery,
  ) => Operation<readonly InstanceRef[]>
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 内部 helper（不导出）
// ═══════════════════════════════════════════════════════════════

/** 过滤空 checks 数组：null/undefined/[] → undefined */
function nonEmptyChecks(checks: readonly ModuleKind.CheckEntry[] | undefined): readonly ModuleKind.CheckEntry[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}

/** 解析单段路径字符串 "kind[id]" → PathSegment */
function parseSegment(part: string, raw: string, position: number): ModuleKind.PathSegment {
  const openIndex = part.indexOf('[')
  const closeIndex = part.lastIndexOf(']')
  if (openIndex <= 0 || closeIndex !== part.length - 1 || closeIndex <= openIndex) {
    throw new ModuleKind.PathParseError(
      'INVALID_SEGMENT', raw,
      `invalid segment syntax "${part}": expected "<kind>[<id>]"`,
      position,
    )
  }
  const kind = part.slice(0, openIndex)
  const id = part.slice(openIndex + 1, closeIndex)
  if (kind.length === 0) {
    throw new ModuleKind.PathParseError('EMPTY_KIND', raw, `empty kind in segment "${part}"`, position)
  }
  if (id.length === 0) {
    throw new ModuleKind.PathParseError('EMPTY_ID', raw, `empty id in segment "${part}"`, position)
  }
  return new ModuleKind.PathSegment(kind, id)
}

/**
 * 将路径 body（去掉首 /）按 / 分割为段字符串。
 * 正确处理方括号嵌套（如 kind[a/b] 不被中间的 / 分割）。
 */
function splitRawSegments(raw: string): string[] {
  const body = raw.slice(1)
  const segments: string[] = []
  let bracketDepth = 0
  let segmentStart = 0

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]
    if (char === '[') {
      bracketDepth += 1
    } else if (char === ']') {
      bracketDepth -= 1
      if (bracketDepth < 0) {
        throw new ModuleKind.PathParseError('INVALID_SEGMENT', raw, 'unexpected closing bracket in path', index + 1)
      }
    } else if (char === '/' && bracketDepth === 0) {
      segments.push(body.slice(segmentStart, index))
      segmentStart = index + 1
    }
  }

  if (bracketDepth !== 0) {
    throw new ModuleKind.PathParseError('INVALID_SEGMENT', raw, 'unclosed bracket in path')
  }

  segments.push(body.slice(segmentStart))
  return segments
}

// ── schema 规范化 ────────────────────────────────────────────

/** 规范化 AttributeSchema 数组：确保每个元素是不可变副本 */
function normalizeAttributeSchemas(attributes: readonly AttributeSchema[]): readonly AttributeSchema[] {
  return attributes.map((attribute) => ({
    name: attribute.name,
    description: attribute.description,
    schema: attribute.schema,
    readable: attribute.readable,
    writable: attribute.writable,
    ...(attribute.example === undefined ? {} : { example: attribute.example }),
  }))
}

/** 规范化 ActionSchema 数组：复制数组字段防止外部修改 */
function normalizeActionSchemas(actions: readonly ActionSchema[]): readonly ActionSchema[] {
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

/** 按 name 创建索引 Map，重复 name 抛错 */
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

// ── runner 属性存取 ──────────────────────────────────────────

/**
 * 把 runner 函数对象视为普通对象，用于存取属性。
 * 利用 JS 函数即对象的特性，无需额外创建存储容器。
 */
function runnerProperties(runner: ModuleKind.Runner): ModuleKindRunnerProperties {
  return Object.assign(runner, EMPTY_RUNNER_PROPERTIES)
}

// ── 默认实现 / 错误消息 ──────────────────────────────────────

function actionNotImplemented(kind: string, actionName: string): ModuleKind.OperationResult<LlmJsonValue> {
  return ModuleKind.OperationResult.failCode(
    'ACTION_NOT_IMPLEMENTED',
    `${kind} 未注册动作 "${actionName}"`,
    '请检查该 ModuleKind.runner 是否实现了该 actionName。',
  )
}

function attributeNotDeclared(kind: string, attrName: string): ModuleKind.OperationResult<never> {
  return ModuleKind.OperationResult.failCode(
    'ATTRIBUTE_NOT_DECLARED',
    `kind "${kind}" 未声明属性 "${attrName}"`,
    '可调用 describeKind 查看该 kind 的属性表',
  )
}

function attributeNotReadable(kind: string, attrName: string): ModuleKind.OperationResult<never> {
  return ModuleKind.OperationResult.failCode(
    'ATTRIBUTE_NOT_READABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可读`,
  )
}

function attributeNotWritable(kind: string, attrName: string): ModuleKind.OperationResult<never> {
  return ModuleKind.OperationResult.failCode(
    'ATTRIBUTE_NOT_WRITABLE',
    `属性 "${attrName}" 在 kind "${kind}" 上不可写`,
  )
}

function passthroughFailure(result: ModuleKind.OperationResult<unknown>): ModuleKind.OperationResult<never> {
  return ModuleKind.OperationResult.passthroughFailure(result)
}

function actionExecuteError(error: unknown): ModuleKind.OperationResult<LlmJsonValue> {
  return ModuleKind.OperationResult.failCode(
    'ACTION_EXECUTE_ERROR',
    error instanceof Error ? error.message : String(error),
    '检查动作 runner 实现；业务可捕获异常后返回更具体的 OperationResult。',
  )
}
