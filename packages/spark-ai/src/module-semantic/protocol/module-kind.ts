/**
 * @packageDocumentation
 *
 * 模块语义协议 — 模块类型定义。
 *
 * ModuleKind 描述一种业务模块的形状,也是通用语义运行入口。
 * 进程内每种 kind 一份,启动后冻结。
 *
 * VCM 生成能力模块元数据的 JSDoc 标识和范围见:
 * ../DM-VCM-MODULE-METADATA-SCOPE.md
 *
 * 三类声明:
 * - attributes: 模块开放给 LLM 的属性表(getAttribute / setAttribute 派生源)
 * - actions:    模块开放给 LLM 的动作表(invokeAction 派生源)
 * - children:   模块下可挂的子 ModuleKind 名单(声明拓扑边,不预占实例)
 *
 * 运行时只接收标准 ModuleKind 对象。业务迁移期可以直接实例化或继承
 * ModuleKind;目标形态是 VCM 生成 ModuleKindOptions / factory,
 * 业务只注入 runner/list/find 运行委托。
 */

import type { LlmJsonObject, LlmJsonSchema, LlmJsonValue, LlmParameterSchemaRoot } from '../../schema'
import type { ModulePathSegment } from './module-path'
import {
  errorCheck,
  infoCheck,
  ok,
  type CheckEntry,
  type OperationResult,
} from './operation-result'

// ═══════════════════════════════════════════════════════
// 1. 属性 / 动作 schema
// ═══════════════════════════════════════════════════════

/**
 * 属性可读/可写能力位。
 */
export interface AttributeAccessFlags {
  readonly readable: boolean
  readonly writable: boolean
}

/**
 * 属性声明。
 *
 * 协议层会按 (kind, attrName) 派生出 getAttribute / setAttribute 工具,
 * 调用时路由到 ModuleKind 同名方法。
 *
 * - name:        属性名(在 kind 内唯一)
 * - description: 给 LLM 看的中文说明
 * - schema:      值类型 schema(LLM 读取/写入此属性时传值的形状)
 * - readable:    是否允许 getAttribute
 * - writable:    是否允许 setAttribute
 * - example:     示例值(可选,帮 LLM 理解)
 */
export interface AttributeSchema extends AttributeAccessFlags {
  readonly name: string
  readonly description: string
  readonly schema: LlmJsonSchema
  readonly example?: LlmJsonValue | undefined
}

/**
 * 动作失败模式描述(给 LLM 看)。
 */
export interface ActionFailureMode {
  readonly code: string
  readonly when: string
  readonly fix: string
}

export type ActionResultSchema = LlmJsonSchema | LlmJsonObject

/**
 * 动作声明。
 *
 * 协议层按 (kind, actionName) 派生 invokeAction 工具,
 * 调用时路由到 ModuleKind.invokeAction(pathContext, actionName, args)。
 *
 * - name:         动作名(在 kind 内唯一)
 * - description:  给 LLM 看的中文说明
 * - paramsSchema: 参数 schema(根 type 必须是 object)
 * - resultSchema: 返回值 schema(可选,告知 LLM 期望的返回结构)
 * - usageRules:   调用前注意事项列表(LLM 在 describeKind / invokeAction 描述里能看到)
 * - failureModes: 失败模式列表,展示给 LLM
 * - example:      示例参数(可选)
 */
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
// 2. 运行上下文 / 通用运行入口
// ═══════════════════════════════════════════════════════

/**
 * host 作用域信息。
 *
 * 由 Host 在 executeTool 时注入,协议核心本身不持有也不解释。
 * 业务可用它识别当前会话绑定的业务实例。
 */
export interface ModuleHostContext {
  readonly moduleId: string
  readonly moduleInstanceId: string
  readonly instanceId: string
}

/**
 * 调用语义模块运行入口时传入的路径上下文。
 */
export interface ModulePathContext {
  readonly segments: readonly ModulePathSegment[]
  readonly segment: ModulePathSegment
  readonly host?: ModuleHostContext | undefined
}

export type ModuleInstanceQuery = Readonly<Record<string, LlmJsonValue>>

export interface ModuleInstanceRef {
  readonly id: string
  readonly label: string
  readonly summary?: string | undefined
}

export type ModuleKindOperation<TData> = OperationResult<TData> | Promise<OperationResult<TData>>

export type ModuleKindRunner = (
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) => ModuleKindOperation<LlmJsonValue>

type ModuleKindRunnerProperties = Record<string, unknown>

const EMPTY_RUNNER_PROPERTIES: ModuleKindRunnerProperties = {}

export type ModuleChildrenLister<TListRef extends ModuleInstanceRef = ModuleInstanceRef> = (
  ctx: ModulePathContext,
  childKind?: string,
) => ModuleKindOperation<readonly TListRef[]>

export type ModuleInstanceFinder<TFindRef extends ModuleInstanceRef = ModuleInstanceRef> = (
  ctx: ModulePathContext,
  childKind: string,
  query: ModuleInstanceQuery,
) => ModuleKindOperation<readonly TFindRef[]>

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

// ═══════════════════════════════════════════════════════
// 3. 模块类型契约
// ═══════════════════════════════════════════════════════

/**
 * 模块类型构造参数。
 */
export interface ModuleKindOptions<
  TListRef extends ModuleInstanceRef = ModuleInstanceRef,
  TFindRef extends ModuleInstanceRef = TListRef,
> {
  readonly kind: string
  readonly name: string
  readonly description: string
  readonly attributes?: readonly AttributeSchema[] | undefined
  readonly actions?: readonly ActionSchema[] | undefined
  readonly children?: readonly string[] | undefined
  readonly runner?: ModuleKindRunner | undefined
  readonly list?: ModuleChildrenLister<TListRef> | undefined
  readonly find?: ModuleInstanceFinder<TFindRef> | undefined
}

/**
 * 模块类型标准 class。
 *
 * 协议层标准模块类型。
 *
 * 迁移期业务方可以直接 `new ModuleKind({...})` 注册语义描述,
 * 也可以继承本类把旧业务系统适配到通用语义入口。目标形态是由 VCM
 * 生成 `ModuleKindOptions`,业务代码只提供 runner/list/find 委托。
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
export class ModuleKind<
  TListRef extends ModuleInstanceRef = ModuleInstanceRef,
  TFindRef extends ModuleInstanceRef = TListRef,
> {
  public readonly kind: string

  public readonly name: string

  public readonly description: string

  public readonly attributes: readonly AttributeSchema[]

  public readonly actions: readonly ActionSchema[]

  public readonly children: readonly string[]

  private readonly moduleAttributeByName: ReadonlyMap<string, AttributeSchema>

  private readonly moduleActionByName: ReadonlyMap<string, ActionSchema>

  public runner: ModuleKindRunner

  public list: ModuleChildrenLister

  public find: ModuleInstanceFinder

  public constructor(options: ModuleKindOptions<TListRef, TFindRef>) {
    this.kind = options.kind
    this.name = options.name
    this.description = options.description
    this.attributes = normalizeAttributeSchemas(options.attributes ?? [])
    this.moduleAttributeByName = createNamedMap(this.attributes, 'attribute')
    this.actions = normalizeActionSchemas(options.actions ?? [])
    this.moduleActionByName = createNamedMap(this.actions, 'action')
    this.children = options.children ?? []
    this.runner = options.runner ?? ((_ctx, actionName) => actionNotImplemented(this.kind, actionName))
    this.list = options.list ?? (() => ok<readonly ModuleInstanceRef[]>([]))
    this.find = options.find ?? ((ctx, childKind) => {
      if (childKind !== this.kind || ctx.segments.length !== 0) {
        return ok<readonly ModuleInstanceRef[]>([])
      }
      const ref = this.createCurrentInstanceRef(ctx)
      return ok<readonly ModuleInstanceRef[]>(ref === null ? [] : [ref])
    })
  }

  public findAttribute(attrName: string): AttributeSchema | undefined {
    return this.moduleAttributeByName.get(attrName)
  }

  public findAction(actionName: string): ActionSchema | undefined {
    return this.moduleActionByName.get(actionName)
  }

  public getAttribute(
    _ctx: ModulePathContext,
    attrName: string,
  ): Promise<OperationResult<LlmJsonValue>> {
    const attr = this.findAttribute(attrName)
    if (attr === undefined) {
      return Promise.resolve(attributeNotDeclared(this.kind, attrName))
    }
    if (!attr.readable) {
      return Promise.resolve(attributeNotReadable(this.kind, attrName))
    }

    const rawValue = runnerProperties(this.runner)[attrName]
    if (rawValue === undefined) {
      return Promise.resolve({
        ok: false,
        checks: [
          errorCheck(
            'ATTRIBUTE_VALUE_NOT_FOUND',
            `${this.kind}.runner 未设置属性 "${attrName}"`,
            '请确认 ModuleKind.runner 函数对象上已设置该属性。',
          ),
        ],
      })
    }

    const value = coerceLlmJsonValue(rawValue)
    if (value === undefined) {
      return Promise.resolve({
        ok: false,
        checks: [
          errorCheck(
            'ATTRIBUTE_VALUE_NOT_JSON',
            `${this.kind}.runner 属性 "${attrName}" 不是可序列化 JSON 值`,
            '请把 runner 属性值保持为字符串、数字、布尔、null、数组或普通对象。',
          ),
        ],
      })
    }
    return Promise.resolve(ok(value))
  }

  public setAttribute(
    _ctx: ModulePathContext,
    attrName: string,
    value: LlmJsonValue,
  ): Promise<OperationResult<void>> {
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
      return Promise.resolve({
        ok: false,
        checks: [
          errorCheck(
            'ATTRIBUTE_WRITE_FAILED',
            `${this.kind}.runner 属性 "${attrName}" 写入失败`,
            '请确认 runner 函数对象允许写入该属性。',
          ),
        ],
      })
    }
    return Promise.resolve(ok<void>())
  }

  public async invokeAction(
    ctx: ModulePathContext,
    actionName: string,
    args: Readonly<Record<string, LlmJsonValue>>,
  ): Promise<OperationResult<LlmJsonValue>> {
    try {
      return await this.runner(ctx, actionName, args)
    } catch (error) {
      return actionExecuteError(error)
    }
  }

  public listChildren(
    ctx: ModulePathContext,
    childKind?: string,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.list(ctx, childKind))
  }

  public findInstance(
    ctx: ModulePathContext,
    childKind: string,
    query: ModuleInstanceQuery,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    return Promise.resolve(this.find(ctx, childKind, query))
  }

  public resolveChild(
    ctx: ModulePathContext,
    childKind: string,
    childId: string,
  ): Promise<OperationResult<boolean>> {
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

  protected okJson(data?: unknown, checks?: readonly CheckEntry[]): OperationResult<LlmJsonValue> {
    const json = coerceLlmJsonValue(data)
    return {
      ok: true,
      ...(json === undefined ? {} : { data: json }),
      ...(checks === undefined || checks.length === 0 ? {} : { checks }),
    }
  }

  protected failJson(code: string, message: string, hint?: string): OperationResult<LlmJsonValue> {
    return {
      ok: false,
      checks: [errorCheck(code, message, hint)],
    }
  }

  protected serviceResultToOperationResult(result: ModuleActionServiceResult): OperationResult<LlmJsonValue> {
    if (result.ok) {
      return this.okJson(
        result.data,
        result.summary === undefined ? undefined : [infoCheck('OK', result.summary)],
      )
    }
    return this.failJson(result.code, result.msg, result.fix)
  }

  private async resolve(
    ctx: ModulePathContext,
    childKind: string,
    childId: string,
  ): Promise<OperationResult<boolean>> {
    if (!this.children.includes(childKind)) {
      return ok(false)
    }

    const found = await this.find(ctx, childKind, { id: childId })
    if (!found.ok) {
      return passthroughFailure(found)
    }
    if ((found.data ?? []).some((ref) => ref.id === childId)) {
      return ok(true)
    }

    const listed = await this.list(ctx, childKind)
    if (!listed.ok) {
      return passthroughFailure(listed)
    }
    return ok((listed.data ?? []).some((ref) => ref.id === childId))
  }
}

interface NamedSchema {
  readonly name: string
}

function normalizeAttributeSchemas(attributes: readonly AttributeSchema[]): readonly AttributeSchema[] {
  return [...attributes]
}

function normalizeActionSchemas(actions: readonly ActionSchema[]): readonly ActionSchema[] {
  return actions.map((action) => normalizeActionSchema(action))
}

function createNamedMap<TSchema extends NamedSchema>(
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

function normalizeActionSchema(action: ActionSchema): ActionSchema {
  return {
    name: action.name,
    description: action.description,
    paramsSchema: action.paramsSchema,
    ...(action.resultSchema === undefined ? {} : { resultSchema: action.resultSchema }),
    ...(action.usageRules === undefined ? {} : { usageRules: action.usageRules }),
    ...(action.failureModes === undefined ? {} : { failureModes: action.failureModes }),
    ...(action.example === undefined ? {} : { example: action.example }),
  }
}

function actionNotImplemented(kind: string, actionName: string): OperationResult<LlmJsonValue> {
  return {
    ok: false,
    checks: [
      errorCheck(
        'ACTION_NOT_IMPLEMENTED',
        `${kind} 未注册动作 "${actionName}"`,
        '请检查该 ModuleKind.runner 是否实现了该 actionName。',
      ),
    ],
  }
}

function attributeNotDeclared(kind: string, attrName: string): OperationResult<never> {
  return {
    ok: false,
    checks: [
      errorCheck(
        'ATTRIBUTE_NOT_DECLARED',
        `kind "${kind}" 未声明属性 "${attrName}"`,
        '可调用 describeKind 查看该 kind 的属性表',
      ),
    ],
  }
}

function attributeNotReadable(kind: string, attrName: string): OperationResult<never> {
  return {
    ok: false,
    checks: [
      errorCheck(
        'ATTRIBUTE_NOT_READABLE',
        `属性 "${attrName}" 在 kind "${kind}" 上不可读`,
      ),
    ],
  }
}

function attributeNotWritable(kind: string, attrName: string): OperationResult<never> {
  return {
    ok: false,
    checks: [
      errorCheck(
        'ATTRIBUTE_NOT_WRITABLE',
        `属性 "${attrName}" 在 kind "${kind}" 上不可写`,
      ),
    ],
  }
}

function passthroughFailure(result: OperationResult<unknown>): OperationResult<never> {
  return {
    ok: false,
    ...(result.checks === undefined ? {} : { checks: result.checks }),
    ...(result.state === undefined ? {} : { state: result.state }),
  }
}

function actionExecuteError(error: unknown): OperationResult<LlmJsonValue> {
  return {
    ok: false,
    checks: [
      errorCheck(
        'ACTION_EXECUTE_ERROR',
        error instanceof Error ? error.message : String(error),
        '检查动作 runner 实现；业务可捕获异常后返回更具体的 OperationResult。',
      ),
    ],
  }
}

function coerceLlmJsonValue(value: unknown): LlmJsonValue | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    const out: LlmJsonValue[] = []
    for (const item of value) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out.push(coerced)
    }
    return out
  }
  if (value instanceof Set) {
    return [...value].map((item) => coerceLlmJsonValue(item)).filter((item): item is LlmJsonValue => item !== undefined)
  }
  if (value instanceof Map) {
    const out: Record<string, LlmJsonValue> = {}
    for (const [key, item] of value.entries()) {
      const coerced = coerceLlmJsonValue(item)
      if (coerced !== undefined) out[String(key)] = coerced
    }
    return out
  }
  if (typeof value === 'object') {
    const obj: Record<string, LlmJsonValue> = {}
    for (const [key, raw] of Object.entries(value)) {
      const coerced = coerceLlmJsonValue(raw)
      if (coerced !== undefined) obj[key] = coerced
    }
    return obj
  }
  return undefined
}
