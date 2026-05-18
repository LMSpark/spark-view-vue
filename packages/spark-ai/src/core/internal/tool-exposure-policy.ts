import type { AiRuntimeKnowledgeProjection } from '../protocol/runtime-contracts'
import { AiInvocationProtocol } from './invocation-helpers'

export interface AiRuntimeToolExposurePolicyOptions {
  readonly threshold?: number | undefined
  readonly initialModuleIds?: readonly string[] | ReadonlySet<string> | undefined
  readonly guideFunctionId?: string | undefined
}

const DEFAULT_STAGED_TOOL_EXPOSURE_THRESHOLD = 24
const DEFAULT_INITIAL_MODULE_IDS = ['knowledge', 'lifecycle'] as const
const DEFAULT_GUIDE_FUNCTION_ID = 'guideFunction'

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

function hasProjectedAction(projection: AiRuntimeKnowledgeProjection, action: string): boolean {
  return projection.availableFunctions.some((exposure) => exposure.action === action)
}

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
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return
  const guidedAction = (args as { readonly action?: unknown }).action
  if (typeof guidedAction !== 'string' || guidedAction.trim() === '') return
  if (hasProjectedAction(projection, guidedAction)) {
    enabledActions.add(guidedAction)
  }
}
