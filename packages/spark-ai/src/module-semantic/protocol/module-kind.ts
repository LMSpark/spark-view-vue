/**
 * @packageDocumentation
 *
 * 模块语义协议 — ModuleKind 核心类型。
 *
 * ModuleKind 是协议唯一核心 class，描述一种业务模块的形状，也是通用语义运行入口。
 * 进程内每种 kind 一份,启动后冻结。
 *
 * 所有附属类型收敛到 ModuleKind namespace 下：
 * - ModuleKind.Path / PathSegment / PathParseError — 路径值对象
 * - ModuleKind.OperationResult / CheckEntry — 操作结果
 * - ModuleKind.Runner / ChildrenLister / InstanceFinder — 运行委托类型
 * - ModuleKind.HostContext / PathContext / InstanceRef — 上下文类型
 *
 * VCM 生成能力模块元数据的 JSDoc 标识和范围见:
 * ../DM-VCM-MODULE-METADATA-SCOPE.md
 */

import type { LlmJsonObject, LlmJsonSchema, LlmJsonValue, LlmParameterSchemaRoot } from '../../schema'

// ═══════════════════════════════════════════════════════
// 1. 属性 / 动作 schema（顶层，与 ModuleKind 并列）
// ═══════════════════════════════════════════════════════

export interface AttributeSchema {
  readonly name: string
  readonly description: string
  readonly schema: LlmJsonSchema
  readonly readable: boolean
  readonly writable: boolean
  readonly example?: LlmJsonValue | undefined
}

export type AttributeAccessFlags = Pick<AttributeSchema, 'readable' | 'writable'>

export interface ActionFailureMode {
  readonly code: string
  readonly when: string
  readonly fix: string
}

export type ActionResultSchema = LlmJsonSchema | LlmJsonObject

export interface ActionSchema {
  readonly name: string
  readonly description: string
  readonly paramsSchema: LlmParameterSchemaRoot
  readonly resultSchema?: ActionResultSchema | undefined
  readonly usageRules?: readonly string[] | undefined
  readonly failureModes?: readonly ActionFailureMode[] | undefined
  readonly example?: LlmJsonValue | undefined
}

// ═══════════════════════════════════════════════════════
// 2. ModuleKind class — 协议核心（必须在 namespace 之前）
// ═══════════════════════════════════════════════════════

type ModuleKindRunnerProperties = Record<string, unknown>

const EMPTY_RUNNER_PROPERTIES: ModuleKindRunnerProperties = {}

type ModuleActionServiceResult =
  | {
    readonly ok: true
    readonly data?: unknown
    readonly summary?: string | undefined
  }
  | {
    readonly ok: false
    readonly code: string
    readonly msg: string
    readonly fix?: string | undefined
  }

/**
 * 模块类型标准 class。
 *
 * 协议层标准模块类型。
 *
 * 迁移期业务方可以直接 `new ModuleKind({...})` 注册语义描述,
 * 也可以继承本类把旧业务系统适配到通用语义入口。目标形态是由 VCM
 * 生成 `ModuleKind` factory,业务代码只提供 runner/list/find 委托。
 *
 * `listChildren` / `findInstance` / `resolveChild` 是协议入口,统一由本基类实现;
 * 业务只挂 `list` / `find` 函数属性作为发现委托。
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
  public readonly kind: string
  public readonly name: string
  public readonly description: string
  public readonly attributes: readonly AttributeSchema[]
  public readonly actions: readonly ActionSchema[]
  public readonly children: readonly string[]

  private readonly moduleAttributeByName: ReadonlyMap<string, AttributeSchema>
  private readonly moduleActionByName: ReadonlyMap<string, ActionSchema>

  public runner: ModuleKind.Runner
  public list: ModuleKind.ChildrenLister
  public find: ModuleKind.InstanceFinder

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

  // ── 查询 schema ──

  public findAttribute(attrName: string): AttributeSchema | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  public findAction(actionName: string): ActionSchema | undefined {
    return this.moduleActionByName.get(actionName)
  }

  // ── 属性读写 ──

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

  // ── 动作调用 ──

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

  // ── 子实例发现 ──

  public listChildren(
    ctx: ModuleKind.PathContext,
    childKind?: string,
  ): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return Promise.resolve(this.list(ctx, childKind))
  }

  public findInstance(
    ctx: ModuleKind.PathContext,
    childKind: string,
    query: ModuleKind.InstanceQuery,
  ): Promise<ModuleKind.OperationResult<readonly ModuleKind.InstanceRef[]>> {
    return Promise.resolve(this.find(ctx, childKind, query))
  }

  public resolveChild(
    ctx: ModuleKind.PathContext,
    childKind: string,
    childId: string,
  ): Promise<ModuleKind.OperationResult<boolean>> {
    return this.resolve(ctx, childKind, childId)
  }

  // ── protected 辅助 ──

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

  protected okJson(data?: unknown, checks?: readonly ModuleKind.CheckEntry[]): ModuleKind.OperationResult<LlmJsonValue> {
    const json = ModuleKind.coerceJsonValue(data)
    return ModuleKind.OperationResult.ok(json, checks)
  }

  protected failJson(code: string, message: string, hint?: string): ModuleKind.OperationResult<LlmJsonValue> {
    return ModuleKind.OperationResult.failCode(code, message, hint)
  }

  protected serviceResultToOperationResult(result: ModuleActionServiceResult): ModuleKind.OperationResult<LlmJsonValue> {
    if (result.ok) {
      return this.okJson(
        result.data,
        result.summary === undefined ? undefined : [ModuleKind.CheckEntry.info('OK', result.summary)],
      )
    }
    return this.failJson(result.code, result.msg, result.fix)
  }

  // ── 公开工具方法 ──

  /**
   * 把任意值安全投影为 LlmJsonValue。
   *
   * 处理 string / number / boolean / null / Array / Set / Map / 普通 object，
   * 不可序列化值返回 undefined。
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

  // ── 私有方法 ──

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

// ═══════════════════════════════════════════════════════
// 3. ModuleKind namespace — 附属类型（在 class 之后，与 class 合并）
// ═══════════════════════════════════════════════════════

export namespace ModuleKind {
  // ── 3.1 操作结果 ──

  export type CheckEntryLevel = 'error' | 'warn' | 'info'

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

    public static ok<TData>(
      data?: TData,
      checks?: readonly CheckEntry[],
      state?: Record<string, unknown>,
    ): OperationResult<TData> {
      return new OperationResult({ ok: true, data, checks, state })
    }

    public static fail(
      checks: readonly CheckEntry[],
      state?: Record<string, unknown>,
    ): OperationResult<never> {
      if (checks.length === 0) {
        throw new Error('OperationResult.fail requires at least one CheckEntry')
      }
      return new OperationResult({ ok: false, checks, state })
    }

    public static failCode(code: string, message: string, hint?: string): OperationResult<never> {
      return OperationResult.fail([CheckEntry.error(code, message, hint)])
    }

    public static passthroughFailure(result: OperationResult<unknown>): OperationResult<never> {
      return new OperationResult({ ok: false, checks: result.checks, state: result.state })
    }
  }

  // ── 3.2 模块路径 ──

  export type PathParseErrorCode =
    | 'EMPTY'
    | 'MISSING_LEADING_SLASH'
    | 'INVALID_SEGMENT'
    | 'EMPTY_KIND'
    | 'EMPTY_ID'

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

  export class PathSegment {
    public constructor(
      public readonly kind: string,
      public readonly id: string,
    ) {}

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
   * 模块路径。
   *
   * 不可变值对象。
   *
   * 构造方式:
   * - ModuleKind.Path.parse('/school[jianguo]/grade[g3]')  显式字符串解析
   * - ModuleKind.Path.of([{kind:'school', id:'jianguo'}, ...])  按段构造
   * - ModuleKind.Path.root()  根路径(无段)
   *
   * 路径**永远以 `/` 开头**。根路径序列化为 `/`。
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

    public static parse(raw: string): Path {
      if (raw.length === 0) {
        throw new PathParseError('EMPTY', raw, 'path is empty')
      }
      if (!raw.startsWith('/')) {
        throw new PathParseError(
          'MISSING_LEADING_SLASH',
          raw,
          'path must start with "/"',
          0,
        )
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

    public get isRoot(): boolean {
      return this.segments.length === 0
    }

    public get depth(): number {
      return this.segments.length
    }

    public get tail(): PathSegment | undefined {
      return this.segments.length === 0 ? undefined : this.segments[this.segments.length - 1]
    }

    public parent(): Path {
      if (this.segments.length === 0) {
        return this
      }
      return new Path(this.segments.slice(0, -1))
    }

    public append(segment: PathSegment): Path {
      if (segment.kind.length === 0) {
        throw new PathParseError('EMPTY_KIND', this.toString(), 'cannot append segment with empty kind')
      }
      if (segment.id.length === 0) {
        throw new PathParseError('EMPTY_ID', this.toString(), 'cannot append segment with empty id')
      }
      return new Path([...this.segments, PathSegment.from(segment, this.toString(), this.segments.length)])
    }

    public toString(): string {
      if (this.segments.length === 0) {
        return '/'
      }
      return this.segments.map((seg) => `/${seg.kind}[${seg.id}]`).join('')
    }

    public equals(other: Path): boolean {
      if (this.segments.length !== other.segments.length) {
        return false
      }
      return this.segments.every((seg, index) => {
        const otherSeg = other.segments[index]
        return seg.kind === otherSeg?.kind && seg.id === otherSeg.id
      })
    }
  }

  // ── 3.3 上下文 / 实例引用 / 委托类型 ──

  export interface HostContext {
    readonly moduleId: string
    readonly moduleInstanceId: string
    readonly instanceId: string
  }

  export interface PathContext {
    readonly segments: readonly PathSegment[]
    readonly segment: PathSegment
    readonly host?: HostContext | undefined
  }

  export interface InstanceRef {
    readonly id: string
    readonly label: string
    readonly summary?: string | undefined
  }

  export type InstanceQuery = Readonly<Record<string, LlmJsonValue>>

  export type Operation<TData> = OperationResult<TData> | Promise<OperationResult<TData>>

  export type Runner = (
    ctx: PathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ) => Operation<LlmJsonValue>

  export type ChildrenLister = (
    ctx: PathContext,
    childKind?: string,
  ) => Operation<readonly InstanceRef[]>

  export type InstanceFinder = (
    ctx: PathContext,
    childKind: string,
    query: InstanceQuery,
  ) => Operation<readonly InstanceRef[]>
}

// ═══════════════════════════════════════════════════════
// 4. 内部 helper（不导出）
// ═══════════════════════════════════════════════════════

function nonEmptyChecks(checks: readonly ModuleKind.CheckEntry[] | undefined): readonly ModuleKind.CheckEntry[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}

function parseSegment(part: string, raw: string, position: number): ModuleKind.PathSegment {
  const openIndex = part.indexOf('[')
  const closeIndex = part.lastIndexOf(']')
  if (openIndex <= 0 || closeIndex !== part.length - 1 || closeIndex <= openIndex) {
    throw new ModuleKind.PathParseError(
      'INVALID_SEGMENT',
      raw,
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

function runnerProperties(runner: ModuleKind.Runner): ModuleKindRunnerProperties {
  return Object.assign(runner, EMPTY_RUNNER_PROPERTIES)
}

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
