/**
 * @packageDocumentation
 *
 * 导航器(list / find / describeKind)。
 *
 * 协议固定提供的"看到周围"工具,LLM 必经路径:语义查询 → 拿 id → 拼路径。
 *
 * 三个工具:
 *
 * - listChildren(path, childKind?)
 *     根路径下:返回已注册 kind 名单(LLM 用来发现入口)
 *     非根路径:路由到末段 Capability.listChildren
 *
 * - findInstance(path, childKind, query)
 *     根路径下:需指定 childKind,委托到该 kind 自身 Capability.findInstance(null parent)
 *     非根路径:路由到末段 Capability.findInstance
 *     注:为统一接口,根级查询时父段 ctx 用一个 null-parent context(segment 为查询目标 kind 占位 id 为空串)
 *
 * - describeKind(kind)
 *     返回 ModuleKind 的 attributes / actions / children 元数据,纯协议层操作,不走 Capability
 */

import type {
  ModuleCapability,
  ModuleHostContext,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModulePathContext,
} from '../protocol/capability'
import type { ActionSchema, AttributeSchema, ModuleKind } from '../protocol/module-kind'
import type { ModulePath, ModulePathSegment } from '../protocol/module-path'
import {
  errorCheck,
  ok as okResult,
  type OperationResult,
} from '../protocol/operation-result'
import { type CapabilityRegistry, CapabilityNotFoundError } from './capability-registry'
import type { ModuleKindRegistry } from './module-kind-registry'
import type { ModuleNavigator, ModuleNavigationSuccess } from './module-navigator'

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

export class Navigator {
  public constructor(
    private readonly kinds: ModuleKindRegistry,
    private readonly capabilities: CapabilityRegistry,
    private readonly moduleNavigator: ModuleNavigator,
  ) {}

  /**
   * 列出子实例。
   *
   * - 根路径 + 未指定 childKind:返回已注册的所有 kind 名单
   * - 根路径 + 指定 childKind:暂不支持(根级"列出所有学校"应由业务自行设计 find/list)
   *   返回 ROOT_LIST_REQUIRES_FIND check 引导 LLM 改用 findInstance
   * - 非根路径:委托末段 Capability.listChildren
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
    const navResult = await this.moduleNavigator.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    return navResult.capability.listChildren(navResult.segmentCtx, childKind)
  }

  /**
   * 查询子实例。
   *
   * - 根路径:查询目标 kind 的 Capability,使用空 parent ctx(由 Capability 自行解释)
   * - 非根路径:路由到末段 Capability.findInstance,目标 kind 必须是末段 ModuleKind.children 之一
   *
   * 失败码:
   * - CHILD_KIND_NOT_DECLARED: 非根路径下,目标 kind 不在末段 children 中
   * - KIND_NOT_REGISTERED:     目标 kind 未注册
   * - CAPABILITY_NOT_REGISTERED
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
      const capability = this.tryGetCapability(childKind)
      if (capability === undefined) {
        return {
          ok: false,
          checks: [
            errorCheck(
              'CAPABILITY_NOT_REGISTERED',
              `kind "${childKind}" 缺少 Capability 实现`,
            ),
          ],
        }
      }
      const rootCtx: ModulePathContext = {
        segments: [],
        segment: ROOT_SEGMENT_SENTINEL,
        ...(host === undefined ? {} : { host }),
      }
      return capability.findInstance(rootCtx, childKind, query)
    }
    const navResult = await this.moduleNavigator.navigate(path, host)
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
    return navResult.capability.findInstance(navResult.segmentCtx, childKind, query)
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

  private tryGetCapability(kind: string): ModuleCapability | undefined {
    try {
      return this.capabilities.require(kind)
    } catch (error) {
      if (error instanceof CapabilityNotFoundError) {
        return undefined
      }
      throw error
    }
  }
}

/** 根级 findInstance 调用 Capability 时占位的 segment。kind 为空表示"非具体段"。 */
const ROOT_SEGMENT_SENTINEL: ModulePathSegment = Object.freeze({ kind: '', id: '' })

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
  return 'capability' in result
}
