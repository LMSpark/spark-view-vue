import type { FunctionRuntimeContext } from './contracts'

export function missingParam(name: string): string {
  return `缺少 ${name} 参数`
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function buildExecutionTraceSummary(context: FunctionRuntimeContext): {
  totalActions: number
  actionCounts: Record<string, number>
} {
  const actionCounts: Record<string, number> = {}

  for (const entry of context.patchLog) {
    actionCounts[entry.action] = (actionCounts[entry.action] ?? 0) + 1
  }

  return {
    totalActions: context.patchLog.length,
    actionCounts,
  }
}