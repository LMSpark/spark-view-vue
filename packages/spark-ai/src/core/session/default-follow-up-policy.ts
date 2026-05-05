/**
 * Default Follow-Up Policy — 通用跟进策略
 * Core generic implementation — no business-domain dependencies.
 *
 * 通过可选的 FollowUpDecorations 注入纯字符串/纯结构装饰，
 * 业务层在不引入新策略类的前提下定制提示词内容。
 */

import { getStill } from '../stills/dispatcher'
import type {
  FollowUpBuildContext,
  FollowUpPolicy,
  MonitorContext,
} from './session-contracts'
import type { PostValidationWarning } from '../stills/types'

export interface FollowUpDecorations {
  /** 拼到 [系统后置校验警告] 头部之后的上下文前缀，例如 "[页面名] " */
  warningContextPrefix?: string
  /** 拼到 [系统即时纠错] 头部之后的额外行，例如 "\n[当前编排阶段] generate" */
  errorPhaseLine?: string
  /** 合并进 actionSpec JSON 的额外字段，例如 { businessHint: '...' } */
  actionSpecExtras?: Record<string, unknown>
}

export function formatWarningsAsFollowUp(
  action: string,
  warnings: PostValidationWarning[],
  decorations?: FollowUpDecorations,
): string {
  const lines = warnings.map(w => {
    const fix = w.fix ? `\n  建议: ${w.fix}` : ''
    return `- [${w.rule}] ${w.detail}${fix}`
  })
  const prefix = decorations?.warningContextPrefix ?? ''
  const header = prefix ? `[系统后置校验警告] ${prefix}` : '[系统后置校验警告]'
  return `${header}\n动作 ${action} 执行成功，但存在以下一致性问题：\n${lines.join('\n')}\n请在下一轮优先修复这些问题。`
}

export function buildInlineActionSpec(
  action: string,
  fallbackFix?: string,
  decorations?: FollowUpDecorations,
): string {
  const still = getStill(action)
  const extras = decorations?.actionSpecExtras ?? {}

  if (still === undefined) {
    return JSON.stringify({
      action,
      type: 'unknown',
      paramsSchema: fallbackFix !== undefined
        ? `请直接使用修复建议中的参数格式：${fallbackFix}`
        : '请直接使用上一条修复建议中的参数格式',
      usageRules: ['这是降级函数指南；不需要再次调用 core@knowledge@guideTool。'],
      ...extras,
      example: null,
      failureModes: [],
    }, null, 2)
  }

  return JSON.stringify({
    action: still.action,
    type: still.type,
    paramsSchema: still.paramsSchema ?? null,
    usageRules: still.usageRules ?? [],
    ...extras,
    example: still.example ?? null,
    failureModes: still.failureModes ?? [],
  }, null, 2)
}

export function buildErrorFollowUp(
  action: string,
  code: string,
  msg: string,
  fix: string,
  decorations?: FollowUpDecorations,
): string {
  const inlineActionSpec = buildInlineActionSpec(action, fix, decorations)
  const phaseLine = decorations?.errorPhaseLine ?? ''
  const actionSpecText = `\n对应函数指南（已内联，无需再次查询）:\n${inlineActionSpec}`

  return `[系统即时纠错]${phaseLine}\n动作 ${action} 执行失败（${code}）。\n错误详情: ${msg}\n修复建议: ${fix}${actionSpecText}\n请直接根据上面的函数指南修正参数并重试，不需要再额外调用 core@knowledge@guideTool；不要重复原错误指令。`
}

export function toParamsSignature(params: unknown): string {
  try {
    return JSON.stringify(params ?? null)
  } catch {
    return '__UNSERIALIZABLE_PARAMS__'
  }
}

export function countConsecutiveSameFailedSignature(ctx: MonitorContext): number {
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

function buildEscalatedErrorFollowUp(
  action: string,
  failedCount: number,
  decorations?: FollowUpDecorations,
): string {
  const inlineActionSpec = buildInlineActionSpec(action, undefined, decorations)
  const actionSpecText = `\n对应动作 actionSpec（已内联，无需再次查询）:\n${inlineActionSpec}`

  return `[系统升级纠错]\n动作 ${action} 已连续 ${failedCount} 次使用相同参数失败。\n请停止复用失败参数，直接按已内联 actionSpec 重新组装参数后重试。${actionSpecText}`
}

export class DefaultFollowUpPolicy implements FollowUpPolicy {
  constructor(private readonly decorations?: FollowUpDecorations) {}

  buildFollowUps(ctx: FollowUpBuildContext): string[] {
    const { action, result, monitorCtx } = ctx
    const followUps: string[] = []

    if (!result.ok) {
      followUps.push(buildErrorFollowUp(action, result.code, result.msg, result.fix, this.decorations))
      const failedCount = countConsecutiveSameFailedSignature(monitorCtx)
      if (failedCount >= 2) {
        followUps.push(buildEscalatedErrorFollowUp(action, failedCount, this.decorations))
      }
    }

    if (result.ok && result.warnings !== undefined && result.warnings.length > 0) {
      followUps.push(formatWarningsAsFollowUp(action, result.warnings, this.decorations))
    }

    return followUps
  }
}

export function createDefaultFollowUpPolicy(decorations?: FollowUpDecorations): FollowUpPolicy {
  return new DefaultFollowUpPolicy(decorations)
}
