/**
 * Business Follow-Up Policy — 业务层实现反馈策略
 */

import { getStill } from '../../core/stills/dispatcher'
import type {
  FollowUpBuildContext,
  FollowUpPolicy,
  MonitorContext,
} from '../../core/session/session-contracts'
import type { PostValidationWarning } from '../../core/stills/types'
import type { ProjectPlanningBusinessContext } from './business-context'

export function formatWarningsAsFollowUp(action: string, warnings: PostValidationWarning[]): string {
  const lines = warnings.map(w => {
    const fix = w.fix ? `\n  建议: ${w.fix}` : ''
    return `- [${w.rule}] ${w.detail}${fix}`
  })
  return `[系统后置校验警告]\n动作 ${action} 执行成功，但存在以下一致性问题：\n${lines.join('\n')}\n请在下一轮优先修复这些问题。`
}

function buildInlineActionSpec(action: string, fallbackFix?: string): string {
  const still = getStill(action)
  if (still === undefined) {
    return JSON.stringify({
      action,
      type: 'unknown',
      paramsSchema: fallbackFix !== undefined
        ? `请直接使用修复建议中的参数格式：${fallbackFix}`
        : '请直接使用上一条修复建议中的参数格式',
      usageRules: ['这是降级 actionSpec；不需要再次调用 stills.actionSpec。'],
      example: null,
      failureModes: [],
    }, null, 2)
  }

  return JSON.stringify({
    action: still.action,
    type: still.type,
    paramsSchema: still.paramsSchema ?? null,
    usageRules: still.usageRules ?? [],
    example: still.example ?? null,
    failureModes: still.failureModes ?? [],
  }, null, 2)
}

function buildErrorFollowUp(action: string, code: string, msg: string, fix: string): string {
  const inlineActionSpec = buildInlineActionSpec(action, fix)
  const actionSpecText = `\n对应动作 actionSpec（已内联，无需再次查询）:\n${inlineActionSpec}`

  return `[系统即时纠错]\n动作 ${action} 执行失败（${code}）。\n错误详情: ${msg}\n修复建议: ${fix}${actionSpecText}\n请直接根据上面的 actionSpec 修正参数并重试，不需要再额外调用 stills.actionSpec；不要重复原错误指令。`
}

function toParamsSignature(params: unknown): string {
  try {
    return JSON.stringify(params ?? null)
  } catch {
    return '__UNSERIALIZABLE_PARAMS__'
  }
}

function countConsecutiveSameFailedSignature(ctx: MonitorContext): number {
  if (ctx.result.ok) return 0
  const currentAction = ctx.currentTurn.toolBlock?.action ?? ''
  if (currentAction.length === 0) return 0
  const currentSignature = toParamsSignature(ctx.currentTurn.toolBlock?.params)

  let count = 0
  for (let i = ctx.allTurns.length - 1; i >= 0; i--) {
    const turn = ctx.allTurns[i]
    if (turn === undefined) continue
    if (turn.phase !== 'stills-execute') continue

    const action = turn.toolBlock?.action ?? ''
    const signature = toParamsSignature(turn.toolBlock?.params)
    const failed = turn.stillsResult?.ok === false

    if (failed && action === currentAction && signature === currentSignature) {
      count++
      continue
    }
    break
  }

  return count
}

function buildEscalatedErrorFollowUp(action: string, failedCount: number): string {
  const inlineActionSpec = buildInlineActionSpec(action)
  const actionSpecText = `\n对应动作 actionSpec（已内联，无需再次查询）:\n${inlineActionSpec}`

  return `[系统升级纠错]\n动作 ${action} 已连续 ${failedCount} 次使用相同参数失败。\n请停止复用失败参数，直接按已内联 actionSpec 重新组装参数后重试。${actionSpecText}`
}

export class DefaultFollowUpPolicy implements FollowUpPolicy {
  buildFollowUps(ctx: FollowUpBuildContext): string[] {
    const { action, result, monitorCtx } = ctx
    const followUps: string[] = []

    if (!result.ok) {
      followUps.push(buildErrorFollowUp(action, result.code, result.msg, result.fix))
      const failedCount = countConsecutiveSameFailedSignature(monitorCtx)
      if (failedCount >= 2) {
        followUps.push(buildEscalatedErrorFollowUp(action, failedCount))
      }
    }

    if (result.ok && result.warnings !== undefined && result.warnings.length > 0) {
      followUps.push(formatWarningsAsFollowUp(action, result.warnings))
    }

    return followUps
  }
}

export function createDefaultFollowUpPolicy(): FollowUpPolicy {
  return new DefaultFollowUpPolicy()
}

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
