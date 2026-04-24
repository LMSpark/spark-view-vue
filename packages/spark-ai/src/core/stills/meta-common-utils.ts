import type { IStillSession } from './types'

/** 生成缺少参数的统一提示文案。 */
export function missingParam(name: string): string {
  return `缺少 ${name} 参数`
}

/** 判断值是否为非空字符串。 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** 聚合 patchLog 中各动作执行次数。 */
export function buildExecutionTraceSummary(session: IStillSession): {
  totalActions: number
  actionCounts: Record<string, number>
} {
  const actionCounts: Record<string, number> = {}

  for (const entry of session.patchLog) {
    actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1
  }

  return {
    totalActions: session.patchLog.length,
    actionCounts,
  }
}
