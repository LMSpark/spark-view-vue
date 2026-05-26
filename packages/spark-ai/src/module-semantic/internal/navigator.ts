/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/internal/navigator.ts — 路径导航器 + 发现工具
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层的"空间感知"中枢。统一负责三类操作：
 *   1. 路径遍历（navigate）  — 把 ModulePath 翻译成末段 ModuleKind + PathContext
 *   2. 子实例发现（listChildren / findInstance）
 *   3. Kind 元数据查询（describeKind）
 *
 * 【设计决策】
 *   - 根路径 "/" listChildren 返回所有已注册 kind 名单（LLM 发现入口的第一跳）。
 *   - 路径第一段不验证父子关系（没有父），由业务方在 root ModuleKind 的 action 中自行校验。
 *   - 第二段起通过父 ModuleKind.resolveChild 验证父子存在性。
 *   - 根级 findInstance 使用 ROOT_SEGMENT_SENTINEL 作为占位 context。
 *   - describeKind 全量返回 attributes/actions/children，不剥离任何字段。
 *
 * 【消费方】ModuleSemanticRuntime（直接调用）、FunctionInvoker、AttributeAccessor
 *
 * ═══════════════════════════════════════════════════════════════
 * LLM 发现流程（典型时序）：
 *
 *   1. LLM 调用 listChildren("/") → 得到已注册 kind 名单
 *   2. LLM 调用 findInstance("/", "school", { label: "建国" }) → 拿到具体实例 id
 *   3. LLM 拼接路径 /school[jianguo]/...
 *   4. 后续操作（getAttribute / 标准 function tool）由 Navigator.navigate 校验路径有效性
 * ═══════════════════════════════════════════════════════════════
 */

import {
  ModuleCheckEntry,
  ModuleOperationResult,
  ModulePathSegment,
  type ModuleFunctionMetadata,
  type ModuleAttributeMetadata,
  type ModuleFindInstanceRequest,
  type ModuleHostContext,
  type ModuleInstanceRef,
  type ModuleKind,
  type ModulePath,
  type ModulePathContext,
} from '../protocol'
import type { ModuleKindRegistry } from './module-kind-registry'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 公共类型
// ═══════════════════════════════════════════════════════════════

/**
 * describeKind 返回的完整元数据（仅用于 LLM 阅读，JSON 兼容）。
 *
 * 设计原则：attributes 与 actions 全量复用 ModuleKind 的 schema 类型，
 * paramsSchema / resultSchema / schema / example / usageRules / failureModes
 * 全部传递给 LLM。任何剥离都让 LLM 在写参数时盲注。
 */
export type ModuleKindDescription = Readonly<{
  kind: string
  name: string
  description: string
  parentKind?: string
  attributes: readonly ModuleAttributeMetadata[]
  functions: readonly ModuleFunctionMetadata[]
  payloads: ModuleKind['payloads']
  children: readonly string[]
}>

/**
 * 路径遍历的成功结果。
 * - moduleKind: 末段 kind 对应的 ModuleKind（用于后续属性/动作操作）
 * - segmentCtx: 末段 PathContext（传给末段 ModuleKind 的方法）
 */
export class ModuleNavigationSuccess {
  public constructor(
    public readonly moduleKind: ModuleKind,
    public readonly segmentCtx: ModulePathContext,
  ) {}
}

/** 路径遍历失败结果（OperationResult<never> 的别名，方便类型标注） */
export type ModuleNavigationFailure = ModuleOperationResult<never>

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · Navigator class
// ═══════════════════════════════════════════════════════════════

export class Navigator {
  public constructor(
    private readonly kinds: ModuleKindRegistry,
  ) {}

  // ── 2.1 路径遍历：Path → ModuleKind + PathContext ──────────

  /**
   * 遍历路径，逐段验证，最终返回末段 ModuleKind + PathContext。
   *
   * 验证规则：
   *   1. 根路径不可用于属性/动作调用 → PATH_EMPTY
   *   2. 路径上任何 kind 未注册 → KIND_NOT_REGISTERED
   *   3. 第一段（根级）不验证父子关系 — 没有父，LLM 给的 root id 由业务自行校验
   *   4. 第二段及之后 → 调用父 ModuleKind.resolveChild
   *      - 返回 false → PATH_INVALID
   *      - 返回 ok=false → RESOLVE_ERROR（透传 checks）
   */
  public async navigate(
    path: ModulePath,
    host?: ModuleHostContext,
  ): Promise<ModuleNavigationSuccess | ModuleNavigationFailure> {
    if (path.isRoot) {
      return ModuleOperationResult.failCode('PATH_EMPTY', '路径不能为根 "/",请指定至少一段 <kind>[<id>]')
    }

    const segments = path.segments

    // 第 1 遍：验证所有段的 kind 都已注册
    for (let i = 0; i < segments.length; i++) {
      const segment = requirePathSegment(segments, i)
      if (!this.kinds.has(segment.kind)) {
        return ModuleOperationResult.failCode(
          'KIND_NOT_REGISTERED',
          `路径段 ${formatSegment(segment, i)} 的 kind "${segment.kind}" 未注册`,
          '可通过 listChildren 查看当前路径下可用的子 kind',
        )
      }
    }

    // 第 2 遍：验证父子存在性（第一段跳过，没有父）
    for (let i = 1; i < segments.length; i++) {
      const parentSegment = requirePathSegment(segments, i - 1)
      const childSegment = requirePathSegment(segments, i)
      const parentKind = this.kinds.require(parentSegment.kind)
      const parentCtx: ModulePathContext = {
        segments: segments.slice(0, i),
        segment: parentSegment,
        ...(host === undefined ? {} : { host }),
      }
      const resolveResult = await parentKind.resolveChild(parentCtx, childSegment.kind, childSegment.id)
      if (!resolveResult.ok) {
        const original = resolveResult.checks ?? []
        const wrapper: ModuleCheckEntry = ModuleCheckEntry.error(
          'RESOLVE_ERROR',
          `验证路径段 ${formatSegment(childSegment, i)} 时 ModuleKind 出错`,
        )
        return ModuleOperationResult.fail([wrapper, ...original])
      }
      if (resolveResult.data !== true) {
        return ModuleOperationResult.failCode(
          'PATH_INVALID',
          `路径段 ${formatSegment(childSegment, i)} 在父段 ${formatSegment(parentSegment, i - 1)} 下不存在`,
          `可调用 listChildren 查询父段下可用的 ${childSegment.kind} 列表`,
        )
      }
    }

    // 成功：返回末段 ModuleKind + PathContext
    const tail = requirePathSegment(segments, segments.length - 1)
    const tailKind = this.kinds.require(tail.kind)
    return new ModuleNavigationSuccess(
      tailKind,
      {
        segments,
        segment: tail,
        ...(host === undefined ? {} : { host }),
      },
    )
  }

  // ── 2.2 listChildren：列出子实例 ───────────────────────────

  /**
   * 列出子实例。
   *
   * 行为分三种情况：
   *   - 根路径 + 无 childKind → 返回所有已注册 kind 名单（LLM 发现入口）
   *   - 根路径 + 有 childKind → ROOT_LIST_REQUIRES_FIND，引导 LLM 用 findInstance
   *   - 非根路径 → 委托末段 ModuleKind.listChildren
   */
  public async listChildren(
    path: ModulePath,
    childKind?: string,
    host?: ModuleHostContext,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    if (path.isRoot) {
      if (childKind === undefined) {
        const refs: readonly ModuleInstanceRef[] = this.kinds.list()
          .filter((moduleKind) => moduleKind.parentKind === undefined)
          .map((moduleKind) => ({
            id: moduleKind.kind,
            label: moduleKind.name,
            summary: moduleKind.description,
          }))
        return ModuleOperationResult.ok(refs)
      }
      return ModuleOperationResult.failCode(
        'ROOT_LIST_REQUIRES_FIND',
        `根路径下无法直接列出 kind "${childKind}" 的实例`,
        `请调用 findInstance("/", "${childKind}", {...}) 按业务条件查询`,
      )
    }
    const navResult = await this.navigate(path, host)
    if (!isNavigationSuccess(navResult)) {
      return navResult
    }
    return navResult.moduleKind.listChildren(navResult.segmentCtx, childKind)
  }

  // ── 2.3 findInstance：按条件查询子实例 ─────────────────────

  /**
   * 查询子实例。
   *
   * 行为分两种情况：
   *   - 根路径 → 查询目标 kind 的 ModuleKind，使用 ROOT_SEGMENT_SENTINEL 占位
   *   - 非根路径 → 路由到末段 ModuleKind.findInstance，
   *     目标 kind 必须是末段 children 之一
   *
   * 失败码:
   *   - CHILD_KIND_NOT_DECLARED
   *   - KIND_NOT_REGISTERED
   */
  public async findInstance(
    request: ModuleFindInstanceRequest,
  ): Promise<ModuleOperationResult<readonly ModuleInstanceRef[]>> {
    const { path, childKind, query, host } = request
    if (!this.kinds.has(childKind)) {
      return ModuleOperationResult.failCode(
        'KIND_NOT_REGISTERED',
        `目标 kind "${childKind}" 未注册`,
        '可调用 listChildren("/") 查看已注册 kind',
      )
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
    const tailKind = navResult.moduleKind
    if (!tailKind.children.includes(childKind)) {
      return ModuleOperationResult.failCode(
        'CHILD_KIND_NOT_DECLARED',
        `kind "${tailKind.kind}" 未声明子 kind "${childKind}"`,
        `可调用 describeKind("${tailKind.kind}") 查看允许的子 kind`,
      )
    }
    return navResult.moduleKind.findInstance(navResult.segmentCtx, childKind, query)
  }

  // ── 2.4 describeKind：查询 kind 元数据（纯协议操作，不调用业务 runner）──

  /**
   * 描述某个 kind 的完整元数据（给 LLM 看）。
   * 纯协议层操作，不触发任何业务逻辑。
   *
   * 失败码: KIND_NOT_REGISTERED
   */
  public describeKind(kind: string): ModuleOperationResult<ModuleKindDescription> {
    const moduleKind = this.kinds.get(kind)
    if (moduleKind === undefined) {
      return ModuleOperationResult.failCode(
        'KIND_NOT_REGISTERED',
        `kind "${kind}" 未注册`,
        '可调用 listChildren("/") 查看已注册 kind',
      )
    }
    return ModuleOperationResult.ok(describeKindMeta(moduleKind))
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 内部 helper
// ═══════════════════════════════════════════════════════════════

/**
 * 根级 findInstance 调用 ModuleKind 时使用的占位 segment。
 * kind 和 id 都为空字符串，表示"不来自具体路径段"。
 */
const ROOT_SEGMENT_SENTINEL = new ModulePathSegment('', '')

/** 从 ModuleKind 实例提取元数据摘要 */
function describeKindMeta(moduleKind: ModuleKind): ModuleKindDescription {
  return {
    kind: moduleKind.kind,
    name: moduleKind.name,
    description: moduleKind.description,
    ...(moduleKind.parentKind === undefined ? {} : { parentKind: moduleKind.parentKind }),
    attributes: moduleKind.attributes,
    functions: moduleKind.functions,
    payloads: moduleKind.payloads,
    children: moduleKind.children,
  }
}

/**
 * 类型守卫：判断 navigate 结果是否为成功。
 * 使用 instanceof 而非属性检测，确保准确区分 ModuleNavigationSuccess 和 OperationResult。
 */
export function isNavigationSuccess(
  result: ModuleNavigationSuccess | ModuleOperationResult<never>,
): result is ModuleNavigationSuccess {
  return result instanceof ModuleNavigationSuccess
}

/** 格式化路径段为诊断字符串："[i] kind[id]" */
function formatSegment(segment: ModulePathSegment, index: number): string {
  return `"[${String(index)}] ${segment.kind}[${segment.id}]"`
}

/** 安全取路径段（越界抛错） */
function requirePathSegment(segments: readonly ModulePathSegment[], index: number): ModulePathSegment {
  const segment = segments[index]
  if (segment === undefined) {
    throw new Error(`[Navigator] missing path segment at index ${String(index)}`)
  }
  return segment
}
