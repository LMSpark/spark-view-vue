/**
 * @packageDocumentation
 *
 * 导航器。
 *
 * 统一负责两类导航:
 * - 路径遍历:把 ModulePath 翻译成末段 ModuleKind + PathContext
 * - 发现工具:listChildren / findInstance / describeKind
 *
 * 协议固定提供的"看到周围"工具,LLM 必经路径:语义查询 → 拿 id → 拼路径。
 *
 * - listChildren(path, childKind?)
 *     根路径下:返回已注册 kind 名单(LLM 用来发现入口)
 *     非根路径:路由到末段 ModuleKind.listChildren
 *
 * - findInstance(path, childKind, query)
 *     根路径下:需指定 childKind,委托到该 kind 自身 ModuleKind.findInstance(null parent)
 *     非根路径:路由到末段 ModuleKind.findInstance
 *     注:为统一接口,根级查询时父段 ctx 用一个 null-parent context(segment 为查询目标 kind 占位 id 为空串)
 *
 * - describeKind(kind)
 *     返回 ModuleKind 的 attributes / actions / children 元数据,不调用业务执行入口
 */

import type {
  ModuleHostContext,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModulePathContext,
} from '../protocol/module-kind'
import type { ActionSchema, AttributeSchema, ModuleKind } from '../protocol/module-kind'
import type { ModulePath, ModulePathSegment } from '../protocol/module-path'
import {
  type CheckEntry,
  errorCheck,
  ok as okResult,
  type OperationResult,
} from '../protocol/operation-result'
import type { ModuleKindRegistry } from './module-kind-registry'

/**
 * describeKind 返回的元数据(仅用于 LLM 阅读)。
 *
 * 字段是 JSON 兼容,可直接作为工具返回值。
 *
 * 注:attributes 与 actions 直接复用 ModuleKind 的 schema 类型,保证
 * paramsSchema / resultSchema / schema / example / usageRules / failureModes
 * 全量传递给 LLM。任何剥离都让 LLM 在写参数时盲注,违反 describeKind 工具描述
 * "complete schema" 的承诺。
 */
export interface ModuleKindDescription {
  readonly kind: string
  readonly name: string
  readonly description: string
  readonly attributes: readonly AttributeSchema[]
  readonly actions: readonly ActionSchema[]
  readonly children: readonly string[]
}

/**
 * 路径遍历的成功结果。
 *
 * - moduleKind: 末段 kind 对应的 ModuleKind(用于后续属性/动作调用)
 * - segmentCtx: 末段 PathContext(传给末段 ModuleKind)
 */
export interface ModuleNavigationSuccess {
  readonly moduleKind: ModuleKind
  readonly segmentCtx: ModulePathContext
}

/**
 * 路径遍历的失败结果。
 *
 * checks 至少含一条 error。常见 code:
 * - PATH_EMPTY: 路径为根,无法定位末段
 * - KIND_NOT_REGISTERED: 路径中出现未注册的 kind
 * - PATH_INVALID: 父 ModuleKind resolveChild 返回 false
 * - RESOLVE_ERROR: resolveChild 自身返回 ok=false(透传其 checks)
 */
export type ModuleNavigationFailure = OperationResult<never>

export class Navigator {
  public constructor(
    private readonly kinds: ModuleKindRegistry,
  ) {}

  /**
   * 遍历路径,逐段验证父子存在性,最终返回末段 ModuleKind + PathContext。
   *
   * 协议规则:
   * 1. 根路径不可用于属性/动作调用,返回 PATH_EMPTY
   * 2. 路径上任何 kind 未注册,返回 KIND_NOT_REGISTERED
   * 3. 第一段(根级)不验证父子关系(没有父),直接相信 LLM 给的 root id
   *    业务方可在 root ModuleKind 的 attribute/action 中通过 ctx.segment.id 自行校验
   * 4. 第二段及之后,调用父 ModuleKind.resolveChild 验证
   *    返回 false → PATH_INVALID;返回 ok=false → RESOLVE_ERROR
   */
  public async navigate(
    path: ModulePath,
    host?: ModuleHostContext,
  ): Promise<ModuleNavigationSuccess | ModuleNavigationFailure> {
    if (path.isRoot) {
      return {
        ok: false,
        checks: [
          errorCheck('PATH_EMPTY', '路径不能为根 "/",请指定至少一段 <kind>[<id>]'),
        ],
      }
    }

    const segments = path.segments

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i] as ModulePathSegment
      if (!this.kinds.has(segment.kind)) {
        return failWithCheck(
          'KIND_NOT_REGISTERED',
          `路径段 ${formatSegment(segment, i)} 的 kind "${segment.kind}" 未注册`,
          '可通过 listChildren 查看当前路径下可用的子 kind',
        )
      }
    }

    for (let i = 1; i < segments.length; i++) {
      const parentSegment = segments[i - 1] as ModulePathSegment
      const childSegment = segments[i] as ModulePathSegment
      const parentKind = this.kinds.require(parentSegment.kind)
      const parentCtx: ModulePathContext = {
        segments: segments.slice(0, i),
        segment: parentSegment,
        ...(host === undefined ? {} : { host }),
      }
      const resolveResult = await parentKind.resolveChild(parentCtx, childSegment.kind, childSegment.id)
      if (!resolveResult.ok) {
        const original = resolveResult.checks ?? []
        const wrapper: CheckEntry = errorCheck(
          'RESOLVE_ERROR',
          `验证路径段 ${formatSegment(childSegment, i)} 时 ModuleKind 出错`,
        )
        return { ok: false, checks: [wrapper, ...original] }
      }
      if (resolveResult.data !== true) {
        return failWithCheck(
          'PATH_INVALID',
          `路径段 ${formatSegment(childSegment, i)} 在父段 ${formatSegment(parentSegment, i - 1)} 下不存在`,
          `可调用 listChildren 查询父段下可用的 ${childSegment.kind} 列表`,
        )
      }
    }

    const tail = segments[segments.length - 1] as ModulePathSegment
    const tailKind = this.kinds.require(tail.kind)
    return {
      moduleKind: tailKind,
      segmentCtx: {
        segments,
        segment: tail,
        ...(host === undefined ? {} : { host }),
      },
    }
  }

  /**
   * 列出子实例。
   *
   * - 根路径 + 未指定 childKind:返回已注册的所有 kind 名单
   * - 根路径 + 指定 childKind:暂不支持(根级"列出所有学校"应由业务自行设计 find/list)
   *   返回 ROOT_LIST_REQUIRES_FIND check 引导 LLM 改用 findInstance
   * - 非根路径:委托末段 ModuleKind.listChildren
   */
  public async listChildren(
    path: ModulePath,
    childKind?: string,
    host?: ModuleHostContext,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    if (path.isRoot) {
      if (childKind === undefined) {
        const refs: readonly ModuleInstanceRef[] = this.kinds.list().map((moduleKind) => ({
          id: moduleKind.kind,
          label: moduleKind.name,
          summary: moduleKind.description,
        }))
        return okResult(refs)
      }
      return {
        ok: false,
        checks: [
          errorCheck(
            'ROOT_LIST_REQUIRES_FIND',
            `根路径下无法直接列出 kind "${childKind}" 的实例`,
            `请调用 findInstance("/", "${childKind}", {...}) 按业务条件查询`,
          ),
        ],
      }
    }
    const navResult = await this.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    return navResult.moduleKind.listChildren(navResult.segmentCtx, childKind)
  }

  /**
   * 查询子实例。
   *
   * - 根路径:查询目标 kind 的 ModuleKind,使用空 parent ctx(由 ModuleKind 自行解释)
   * - 非根路径:路由到末段 ModuleKind.findInstance,目标 kind 必须是末段 ModuleKind.children 之一
   *
   * 失败码:
   * - CHILD_KIND_NOT_DECLARED: 非根路径下,目标 kind 不在末段 children 中
   * - KIND_NOT_REGISTERED:     目标 kind 未注册
   */
  public async findInstance(
    path: ModulePath,
    childKind: string,
    query: ModuleInstanceQuery,
    host?: ModuleHostContext,
  ): Promise<OperationResult<readonly ModuleInstanceRef[]>> {
    if (!this.kinds.has(childKind)) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'KIND_NOT_REGISTERED',
            `目标 kind "${childKind}" 未注册`,
            '可调用 listChildren("/") 查看已注册 kind',
          ),
        ],
      }
    }
    if (path.isRoot) {
      const moduleKind = this.kinds.require(childKind)
      const rootCtx: ModulePathContext = {
        segments: [],
        segment: ROOT_SEGMENT_SENTINEL,
        ...(host === undefined ? {} : { host }),
      }
      return moduleKind.findInstance(rootCtx, childKind, query)
    }
    const navResult = await this.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    const tailKind = this.kinds.require(navResult.segmentCtx.segment.kind)
    if (!tailKind.children.includes(childKind)) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'CHILD_KIND_NOT_DECLARED',
            `kind "${tailKind.kind}" 未声明子 kind "${childKind}"`,
            `可调用 describeKind("${tailKind.kind}") 查看允许的子 kind`,
          ),
        ],
      }
    }
    return navResult.moduleKind.findInstance(navResult.segmentCtx, childKind, query)
  }

  /**
   * 描述某个 kind 的元数据(给 LLM 看)。
   *
   * 失败码:
   * - KIND_NOT_REGISTERED
   */
  public describeKind(kind: string): OperationResult<ModuleKindDescription> {
    const moduleKind = this.kinds.get(kind)
    if (moduleKind === undefined) {
      return {
        ok: false,
        checks: [
          errorCheck(
            'KIND_NOT_REGISTERED',
            `kind "${kind}" 未注册`,
            '可调用 listChildren("/") 查看已注册 kind',
          ),
        ],
      }
    }
    return okResult(describeKindMeta(moduleKind))
  }
}

/** 根级 findInstance 调用 ModuleKind 时占位的 segment。kind 为空表示"非具体段"。 */
const ROOT_SEGMENT_SENTINEL: ModulePathSegment = Object.freeze({ kind: '', id: '' })

function failWithCheck(code: string, message: string, hint?: string): ModuleNavigationFailure {
  return { ok: false, checks: [errorCheck(code, message, hint)] }
}

function describeKindMeta(moduleKind: ModuleKind): ModuleKindDescription {
  return {
    kind: moduleKind.kind,
    name: moduleKind.name,
    description: moduleKind.description,
    attributes: moduleKind.attributes,
    actions: moduleKind.actions,
    children: moduleKind.children,
  }
}

function isNavigationSuccess(
  result: ModuleNavigationSuccess | OperationResult<never>,
): result is ModuleNavigationSuccess {
  return 'moduleKind' in result
}

function formatSegment(segment: ModulePathSegment, index: number): string {
  return `"[${String(index)}] ${segment.kind}[${segment.id}]"`
}
