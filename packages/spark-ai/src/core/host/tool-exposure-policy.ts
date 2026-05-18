/**
 * Host 层 tool exposure policy 适配器。
 */

import { addGuidedAiToolAction, createInitialAiToolActionSet } from '../internal/tool-exposure-policy'
import type { AiRuntimeKnowledgeProjection } from '../internal/runtime-protocol'

export function addGuidedToolAction(
  projection: AiRuntimeKnowledgeProjection,
  enabledActions: Set<string> | null,
  executedAction: string,
  args: unknown,
  result: { readonly ok: boolean },
): void {
  addGuidedAiToolAction(projection, enabledActions, executedAction, args, result)
}

export function createInitialToolActionSet(
  projection: AiRuntimeKnowledgeProjection,
): Set<string> | null {
  return createInitialAiToolActionSet(projection)
}
