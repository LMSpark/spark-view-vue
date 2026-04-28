/**
 * Business Follow-Up Policy — 业务层薄装饰器
 *
 * 不再持有独立的 Policy 类；把业务上下文翻译为 FollowUpDecorations，
 * 直接复用 core 的 DefaultFollowUpPolicy（SSoT）。
 */

import type { FollowUpPolicy } from '../../core/session/session-contracts'
import {
  createDefaultFollowUpPolicy,
  type FollowUpDecorations,
} from '../../core/session/default-follow-up-policy'
import type { ProjectPlanningBusinessContext } from './business-context'

function buildDecorations(
  businessContext?: ProjectPlanningBusinessContext,
): FollowUpDecorations | undefined {
  if (businessContext === undefined) return undefined

  const contextInfo = businessContext.pageName
    ? `[${businessContext.pageName}] `
    : businessContext.projectName
      ? `[${businessContext.projectName}] `
      : ''

  const decorations: FollowUpDecorations = {}
  if (contextInfo) decorations.warningContextPrefix = contextInfo
  if (businessContext.phase) {
    decorations.errorPhaseLine = `\n[当前编排阶段] ${businessContext.phase}`
  }
  if (businessContext.scenario) {
    decorations.actionSpecExtras = {
      businessHint: `\n[业务提示] 当前场景: ${businessContext.scenario}，请按场景规则组织参数。`,
    }
  }
  return Object.keys(decorations).length === 0 ? undefined : decorations
}

export function createBusinessFollowUpPolicy(
  businessContext?: ProjectPlanningBusinessContext,
): FollowUpPolicy {
  return createDefaultFollowUpPolicy(buildDecorations(businessContext))
}
