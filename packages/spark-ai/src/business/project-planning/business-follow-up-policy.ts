/**
 * Business Follow-Up Policy — 业务层实现反馈策略
 * Generic helpers are re-exported from core for backward compatibility.
 */

import { getStill } from '../../core/stills/dispatcher'
import type {
  FollowUpBuildContext,
  FollowUpPolicy,
} from '../../core/session/session-contracts'
import type { PostValidationWarning } from '../../core/stills/types'
import type { ProjectPlanningBusinessContext } from './business-context'
import { countConsecutiveSameFailedSignature } from '../../core/session/default-follow-up-policy'

// Re-export generic helpers for backward compatibility
export {
  formatWarningsAsFollowUp,
  DefaultFollowUpPolicy,
  createDefaultFollowUpPolicy,
} from '../../core/session/default-follow-up-policy'

export function formatWarningsAsFollowUpBusiness(
  action: string,
  warnings: PostValidationWarning[],
  businessContext?: ProjectPlanningBusinessContext
): string {
  const contextInfo = businessContext?.pageName
    ? `[${businessContext.pageName}] `
    : businessContext?.projectName
      ? `[${businessContext.projectName}] `
      : ''
  const lines = warnings.map(w => {
    const fix = w.fix ? `\n  建议: ${w.fix}` : ''
    return `- [${w.rule}] ${w.detail}${fix}`
  })

  return `[系统后置校验警告] ${contextInfo}\n动作 ${action} 执行成功，但存在以下一致性问题：\n${lines.join('\n')}\n请在下一轮优先修复这些问题。`
}

function buildInlineActionSpecBusiness(
  action: string,
  fallbackFix?: string,
  businessContext?: ProjectPlanningBusinessContext
): string {
  const still = getStill(action)

  const businessHint = businessContext?.scenario
    ? `\n[业务提示] 当前场景: ${businessContext.scenario}，请按场景规则组织参数。`
    : ''

  if (still === undefined) {
    return JSON.stringify({
      action,
      type: 'unknown',
      paramsSchema: fallbackFix !== undefined
        ? `请直接使用修复建议中的参数格式：${fallbackFix}`
        : '请直接使用上一条修复建议中的参数格式',
      usageRules: ['这是降级 actionSpec；不需要再次调用 stills.actionSpec。'],
      businessHint,
      example: null,
      failureModes: [],
    }, null, 2)
  }

  return JSON.stringify({
    action: still.action,
    type: still.type,
    paramsSchema: still.paramsSchema ?? null,
    usageRules: still.usageRules ?? [],
    businessHint,
    example: still.example ?? null,
    failureModes: still.failureModes ?? [],
  }, null, 2)
}

function buildErrorFollowUpBusiness(
  action: string,
  code: string,
  msg: string,
  fix: string,
  businessContext?: ProjectPlanningBusinessContext
): string {
  const inlineActionSpec = buildInlineActionSpecBusiness(action, fix, businessContext)
  const phaseInfo = businessContext?.phase ? `\n[当前编排阶段] ${businessContext.phase}` : ''
  const actionSpecText = `\n对应动作 actionSpec（已内联，无需再次查询）:\n${inlineActionSpec}`

  return `[系统即时纠错]${phaseInfo}\n动作 ${action} 执行失败（${code}）。\n错误详情: ${msg}\n修复建议: ${fix}${actionSpecText}\n请直接根据上面的 actionSpec 修正参数并重试，不需要再额外调用 stills.actionSpec；不要重复原错误指令。`
}

export class BusinessFollowUpPolicy implements FollowUpPolicy {
  private businessContext: ProjectPlanningBusinessContext | undefined

  constructor(
    businessContext?: ProjectPlanningBusinessContext
  ) {
    this.businessContext = businessContext ?? undefined
  }

  buildFollowUps(ctx: FollowUpBuildContext): string[] {
    const { action, result, monitorCtx } = ctx
    const followUps: string[] = []

    if (!result.ok) {
      followUps.push(
        buildErrorFollowUpBusiness(
          action,
          result.code,
          result.msg,
          result.fix,
          this.businessContext
        )
      )

      const failedCount = countConsecutiveSameFailedSignature(monitorCtx)
      if (failedCount >= 2) {
        followUps.push(this.buildEscalatedErrorFollowUp(action, failedCount))
      }
    }

    if (result.ok && result.warnings !== undefined && result.warnings.length > 0) {
      followUps.push(
        formatWarningsAsFollowUpBusiness(
          action,
          result.warnings,
          this.businessContext
        )
      )
    }

    return followUps
  }

  private buildEscalatedErrorFollowUp(action: string, failedCount: number): string {
    const inlineActionSpec = buildInlineActionSpecBusiness(action)
    const actionSpecText = `\n对应动作 actionSpec（已内联，无需再次查询）:\n${inlineActionSpec}`

    return `[系统升级纠错]\n动作 ${action} 已连续 ${failedCount} 次使用相同参数失败。\n请停止复用失败参数，直接按已内联 actionSpec 重新组装参数后重试。${actionSpecText}`
  }
}

export function createBusinessFollowUpPolicy(
  businessContext?: ProjectPlanningBusinessContext,
): BusinessFollowUpPolicy {
  return new BusinessFollowUpPolicy(businessContext)
}
