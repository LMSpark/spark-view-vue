/**
 * AI 工具暴露策略。
 *
 * 职责：控制 LLM 可用的工具集合——渐进式暴露。
 *
 * 策略：当可用工具超过阈值（默认 24）时，
 * 初始仅暴露 knowledge 和 lifecycle 模块的函数。
 * 当 LLM 调用 guideFunction 后，根据返回结果逐步解锁更多工具。
 *
 * 使用流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. createInitialAiToolActionSet(projection)                  │
 * │    ├─ 检查函数数量是否超过阈值（默认 24）                      │
 * │    ├─ 未超过 → 返回 null（全部暴露）                          │
 * │    └─ 超过 → 仅暴露 knowledge/lifecycle 模块的 action         │
 * │                                                               │
 * │ 2. addGuidedAiToolAction(projection, enabled, action, args)   │
 * │    ├─ 检查执行的 action 是否为 guideFunction                   │
 * │    ├─ 从 args 中提取 guided action                             │
 * │    └─ 如果该 action 在投影中 → 添加到 enabledActions           │
 * │                                                               │
 * │ 3. 在 AiRuntimeToolCodec 中使用 enabledActions 作为过滤条件    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 设计目的：当工具数量过多时，避免 LLM 上下文被大量工具描述淹没。
 * 通过渐进式暴露，LLM 可以先使用 knowledge 模块查询可用工具，
 * 然后逐步解锁并使用具体的业务工具。
 */

import type { AiRuntimeKnowledgeProjection } from '../protocol/runtime-protocol'
import { AiInvocationProtocol } from './invocation-helpers'

// ═══════════════════════════════════════════════════════
// 策略类型定义
// ═══════════════════════════════════════════════════════

/** 工具暴露策略选项 */
export interface AiRuntimeToolExposurePolicyOptions {
  /** 触发渐进式暴露的函数数量阈值，默认 24 */
  readonly threshold?: number | undefined
  /** 初始暴露的模块 ID 集合，默认 ['knowledge', 'lifecycle'] */
  readonly initialModuleIds?: readonly string[] | ReadonlySet<string> | undefined
  /** guideFunction 的函数 ID，默认 'guideFunction' */
  readonly guideFunctionId?: string | undefined
}

/** 默认触发阈值：超过此数量的函数将启用渐进式暴露 */
const DEFAULT_STAGED_TOOL_EXPOSURE_THRESHOLD = 24
/** 默认初始暴露的模块：knowledge 用于查询，lifecycle 用于控制会话 */
const DEFAULT_INITIAL_MODULE_IDS: readonly string[] = ['knowledge', 'lifecycle']
/** 默认 guideFunction ID，LLM 通过此函数查询并解锁新工具 */
const DEFAULT_GUIDE_FUNCTION_ID = 'guideFunction'

// ═══════════════════════════════════════════════════════
// 内部辅助函数
// ═══════════════════════════════════════════════════════

/** 检查值是否为普通对象 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 将 initialModuleIds 选项转换为 Set */
function optionModuleIdSet(options: AiRuntimeToolExposurePolicyOptions): ReadonlySet<string> {
  const moduleIds = options.initialModuleIds ?? DEFAULT_INITIAL_MODULE_IDS
  return moduleIds instanceof Set ? moduleIds : new Set(moduleIds)
}

/** 从 action 字符串中提取函数 ID 部分 */
function functionIdFromAction(action: string): string | null {
  return AiInvocationProtocol.tryParseActionPath(action)?.function ?? null
}

/** 检查是否应该启用渐进式暴露策略 */
function shouldStageToolExposure(
  projection: AiRuntimeKnowledgeProjection,
  options: AiRuntimeToolExposurePolicyOptions,
): boolean {
  const threshold = options.threshold ?? DEFAULT_STAGED_TOOL_EXPOSURE_THRESHOLD
  const initialModuleIds = optionModuleIdSet(options)
  return projection.availableFunctions.length > threshold
    && projection.availableFunctions.some((exposure) => initialModuleIds.has(exposure.moduleId))
}

/** 检查指定 action 是否已在投影中存在 */
function hasProjectedAction(projection: AiRuntimeKnowledgeProjection, action: string): boolean {
  return projection.availableFunctions.some((exposure) => exposure.action === action)
}

// ═══════════════════════════════════════════════════════
// 工具集管理
// ═══════════════════════════════════════════════════════

/**
 * 创建初始工具集。
 *
 * 流程：
 * 1. 检查函数数量是否超过阈值
 * 2. 未超过 → 返回 null（表示全部暴露，不需要过滤）
 * 3. 超过 → 仅返回 knowledge/lifecycle 模块的 action 集合
 *
 * 返回 null 表示调用方应该暴露所有工具；
 * 返回 Set<string> 表示仅暴露集合中的 action。
 */
export function createInitialAiToolActionSet(
  projection: AiRuntimeKnowledgeProjection,
  options: AiRuntimeToolExposurePolicyOptions = {},
): Set<string> | null {
  if (!shouldStageToolExposure(projection, options)) return null
  const moduleIds = optionModuleIdSet(options)
  const actions = new Set<string>()
  for (const exposure of projection.availableFunctions) {
    if (moduleIds.has(exposure.moduleId)) {
      actions.add(exposure.action)
    }
  }
  return actions.size > 0 ? actions : null
}

/**
 * 添加引导工具 action。
 *
 * 触发条件：
 * 1. enabledActions 不为 null（已启用渐进式暴露）
 * 2. 当前执行的 action 是 guideFunction
 * 3. 执行结果 ok=true
 * 4. args.action 是合法的非空字符串
 * 5. args.action 在投影中存在
 *
 * 满足所有条件时，将 guided action 添加到 enabledActions 集合中，
 * 下次工具循环时该工具将对 LLM 可见。
 *
 * 设计目的：让 LLM 通过调用 guideFunction 主动查询并解锁所需工具，
 * 而不是一次性暴露所有工具导致上下文膨胀。
 */
export function addGuidedAiToolAction(
  projection: AiRuntimeKnowledgeProjection,
  enabledActions: Set<string> | null,
  executedAction: string,
  args: unknown,
  result: { readonly ok: boolean },
  options: AiRuntimeToolExposurePolicyOptions = {},
): void {
  const guideFunctionId = options.guideFunctionId ?? DEFAULT_GUIDE_FUNCTION_ID
  // 条件检查：渐进式暴露已启用 && 当前是 guideFunction && 执行成功
  if (enabledActions === null || functionIdFromAction(executedAction) !== guideFunctionId || !result.ok) return
  // 提取 args.action
  if (!isRecord(args)) return
  const guidedAction = args['action']
  if (typeof guidedAction !== 'string' || guidedAction.trim() === '') return
  // 解锁工具：仅当该 action 在投影中时才添加
  if (hasProjectedAction(projection, guidedAction)) {
    enabledActions.add(guidedAction)
  }
}
