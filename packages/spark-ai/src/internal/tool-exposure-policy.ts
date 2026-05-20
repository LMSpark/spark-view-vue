/**
 * AI 工具暴露策略。
 *
 * 职责：控制 LLM 可用的工具集合——渐进式暴露。
 *
 * 策略：当可用工具超过阈值（默认 24）时，
 * 初始仅暴露 knowledge 和 lifecycle 模块的函数。
 * 当 LLM 调用 guideFunction 后，根据返回结果逐步解锁更多工具。
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                工具暴露策略                               │
 * │                                                           │
 * │  createInitialAiToolActionSet()                           │
 * │    ├─ 检查函数数量是否超过阈值（默认 24）                   │
 * │    ├─ 未超过 → 返回 null（全部暴露）                       │
 * │    └─ 超过 → 仅暴露 knowledge/lifecycle 模块的 action      │
 * │                                                           │
 * │  addGuidedAiToolAction()                                  │
 * │    ├─ 检查执行的 action 是否为 guideFunction               │
 * │    ├─ 从 args 中提取 guided action                         │
 * │    └─ 如果该 action 在投影中 → 添加到 enabledActions       │
 * └──────────────────────────────────────────────────────────┘
 */

import type { AiRuntimeKnowledgeProjection } from '../protocol/runtime-protocol'
import { AiInvocationProtocol } from './invocation-helpers'

export interface AiRuntimeToolExposurePolicyOptions {
  readonly threshold?: number | undefined
  readonly initialModuleIds?: readonly string[] | ReadonlySet<string> | undefined
  readonly guideFunctionId?: string | undefined
}

const DEFAULT_STAGED_TOOL_EXPOSURE_THRESHOLD = 24
const DEFAULT_INITIAL_MODULE_IDS: readonly string[] = ['knowledge', 'lifecycle']
const DEFAULT_GUIDE_FUNCTION_ID = 'guideFunction'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionModuleIdSet(options: AiRuntimeToolExposurePolicyOptions): ReadonlySet<string> {
  const moduleIds = options.initialModuleIds ?? DEFAULT_INITIAL_MODULE_IDS
  return moduleIds instanceof Set ? moduleIds : new Set(moduleIds)
}

function functionIdFromAction(action: string): string | null {
  return AiInvocationProtocol.tryParseActionPath(action)?.function ?? null
}

function shouldStageToolExposure(
  projection: AiRuntimeKnowledgeProjection,
  options: AiRuntimeToolExposurePolicyOptions,
): boolean {
  const threshold = options.threshold ?? DEFAULT_STAGED_TOOL_EXPOSURE_THRESHOLD
  const initialModuleIds = optionModuleIdSet(options)
  return projection.availableFunctions.length > threshold
    && projection.availableFunctions.some((exposure) => initialModuleIds.has(exposure.moduleId))
}

/** 检查指定 action 是否已在投影中 */
function hasProjectedAction(projection: AiRuntimeKnowledgeProjection, action: string): boolean {
  return projection.availableFunctions.some((exposure) => exposure.action === action)
}

/**
 * 创建初始工具集。
 * 超过阈值时仅暴露 knowledge/lifecycle 模块的 action，实现渐进式工具暴露。
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
 * 当 LLM 调用 guideFunction 后，从返回的 args.action 中提取并解锁新的工具。
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
  if (enabledActions === null || functionIdFromAction(executedAction) !== guideFunctionId || !result.ok) return
  if (!isRecord(args)) return
  const guidedAction = args['action']
  if (typeof guidedAction !== 'string' || guidedAction.trim() === '') return
  if (hasProjectedAction(projection, guidedAction)) {
    enabledActions.add(guidedAction)
  }
}
