/**
 * @packageDocumentation
 *
 * 路径遍历器。
 *
 * 把 ModulePath 翻译成一连串 Capability.resolveChild 调用,
 * 逐段 fail-fast:任意段返回 false 立即停止并产出错误结果。
 *
 * 协议规定父 Capability 负责验证父子关系:
 * - SchoolCapability.resolveChild(schoolCtx, 'grade', 'g3')
 *   询问"建国学校下面是否有 g3 年级"
 *
 * 末段验证通过后,导航器返回末段 Capability + 末段 PathContext,
 * 由调用方(AttributeAccessor / ActionInvoker / Navigator)继续执行业务操作。
 */

import type { ModuleCapability, ModuleHostContext, ModulePathContext } from '../protocol/capability'
import type { ModulePath, ModulePathSegment } from '../protocol/module-path'
import {
  type CheckEntry,
  errorCheck,
  type OperationResult,
} from '../protocol/operation-result'
import { type CapabilityRegistry, CapabilityNotFoundError } from './capability-registry'
import { type ModuleKindRegistry, ModuleKindNotFoundError } from './module-kind-registry'

/**
 * 路径遍历的成功结果。
 *
 * - capability:    末段 kind 对应的 Capability(用于后续属性/动作调用)
 * - segmentCtx:    末段 PathContext(传给末段 Capability)
 */
export interface ModuleNavigationSuccess {
  readonly capability: ModuleCapability
  readonly segmentCtx: ModulePathContext
}

/**
 * 路径遍历的失败结果。
 *
 * checks 至少含一条 error。常见 code:
 * - PATH_EMPTY:        路径为根,无法定位末段
 * - KIND_NOT_REGISTERED: 路径中出现未注册的 kind
 * - CAPABILITY_NOT_REGISTERED: kind 已注册但 Capability 未注册
 * - PATH_INVALID:      父 Capability resolveChild 返回 false
 * - RESOLVE_ERROR:     resolveChild 自身返回 ok=false(透传其 checks)
 */
export type ModuleNavigationFailure = OperationResult<never>

/**
 * 路径遍历器。
 *
 * 用法:
 * ```ts
 * const navigator = new ModuleNavigator(kindRegistry, capRegistry)
 * const result = await navigator.navigate(path)
 * if ('capability' in result) {
 *   // 成功:用 result.capability 执行业务
 * } else {
 *   // 失败:把 result 透传给 LLM
 * }
 * ```
 */
export class ModuleNavigator {
  public constructor(
    private readonly kinds: ModuleKindRegistry,
    private readonly capabilities: CapabilityRegistry,
  ) {}

  /**
   * 遍历路径,逐段验证父子存在性,最终返回末段 Capability + PathContext。
   *
   * 协议规则:
   * 1. 根路径不可用于属性/动作调用,返回 PATH_EMPTY
   * 2. 路径上任何 kind 未注册,返回 KIND_NOT_REGISTERED
   * 3. 任何 kind 缺 Capability,返回 CAPABILITY_NOT_REGISTERED
   * 4. 第一段(根级)不验证父子关系(没有父),直接相信 LLM 给的 root id
   *    业务方可在 root Capability 的 attribute/action 中通过 ctx.segment.id 自行校验
   * 5. 第二段及之后,调用父 Capability.resolveChild 验证
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
      if (!this.capabilities.has(segment.kind)) {
        return failWithCheck(
          'CAPABILITY_NOT_REGISTERED',
          `kind "${segment.kind}" 缺少 Capability 实现,无法处理路径段 ${formatSegment(segment, i)}`,
        )
      }
    }

    for (let i = 1; i < segments.length; i++) {
      const parentSegment = segments[i - 1] as ModulePathSegment
      const childSegment = segments[i] as ModulePathSegment
      const parentCapability = this.requireCapability(parentSegment.kind)
      const parentCtx: ModulePathContext = {
        segments: segments.slice(0, i),
        segment: parentSegment,
        ...(host === undefined ? {} : { host }),
      }
      const resolveResult = await parentCapability.resolveChild(parentCtx, childSegment.kind, childSegment.id)
      if (!resolveResult.ok) {
        const original = resolveResult.checks ?? []
        const wrapper: CheckEntry = errorCheck(
          'RESOLVE_ERROR',
          `验证路径段 ${formatSegment(childSegment, i)} 时 Capability 出错`,
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
    const tailCapability = this.requireCapability(tail.kind)
    return {
      capability: tailCapability,
      segmentCtx: {
        segments,
        segment: tail,
        ...(host === undefined ? {} : { host }),
      },
    }
  }

  private requireCapability(kind: string): ModuleCapability {
    const cap = this.capabilities.get(kind)
    if (cap === undefined) {
      throw new CapabilityNotFoundError(kind)
    }
    return cap
  }

  /**
   * 校验某 kind 是否注册,未注册抛错。可被外部调用方用于 listChildren / findInstance 入口校验。
   */
  public requireKindRegistered(kind: string): void {
    if (!this.kinds.has(kind)) {
      throw new ModuleKindNotFoundError(kind)
    }
  }
}

function failWithCheck(code: string, message: string, hint?: string): ModuleNavigationFailure {
  return { ok: false, checks: [errorCheck(code, message, hint)] }
}

function formatSegment(segment: ModulePathSegment, index: number): string {
  return `"[${String(index)}] ${segment.kind}[${segment.id}]"`
}
