/**
 * Repeat Detection Monitor — 重复检测监控器
 * Core generic implementation — no business-domain dependencies.
 */

import type { MonitorContext, SessionMonitor } from './session-contracts'
import type { StillResult } from '../stills/types'

export interface RepeatDetectionConfig {
  maxSameSignature?: number
  maxConsecutiveErrors?: number
  maxReadOnlyActions?: number
  abortOnReadOnlyLimit?: boolean
  maxRepeatedFailureRetries?: number
  maxCyclePeriod?: number
  cycleRepeatThreshold?: number
  isReadOnlyAction?: (action: string) => boolean
  getRepeatedFailureKey?: (ctx: MonitorContext) => string | null
  buildCycleFollowUp?: (cycleActions: readonly string[]) => string
  buildRepeatedFailureFollowUp?: (key: string, count: number) => string
  buildReadOnlyLimitFollowUp?: (count: number) => string
}

function buildSignature(action: string, params: unknown): string {
  try {
    return `${action}::${JSON.stringify(params)}`
  } catch {
    return `${action}::unstringifiable`
  }
}

function detectActionCycle(
  actionWindow: string[],
  period: number,
  repeatThreshold: number,
): boolean {
  const needed = period * repeatThreshold
  if (actionWindow.length < needed) return false

  const tail = actionWindow.slice(-needed)
  const baseCycle = tail.slice(0, period)
  if (new Set(baseCycle).size < 2) return false

  for (let i = 0; i < tail.length; i++) {
    if (tail[i] !== tail[i % period]) return false
  }
  return true
}

export function createRepeatDetectionMonitor(
  cfg?: RepeatDetectionConfig,
): SessionMonitor {
  const maxSame = cfg?.maxSameSignature ?? 3
  const maxErrors = cfg?.maxConsecutiveErrors ?? 3
  const maxReadOnlyActions = cfg?.maxReadOnlyActions
  const abortOnReadOnlyLimit = cfg?.abortOnReadOnlyLimit ?? false
  const maxRepeatedFailureRetries = cfg?.maxRepeatedFailureRetries ?? 2
  const maxCyclePeriod = cfg?.maxCyclePeriod ?? 3
  const cycleRepeatThreshold = cfg?.cycleRepeatThreshold ?? 3
  const isReadOnlyAction = cfg?.isReadOnlyAction ?? (() => false)
  const getRepeatedFailureKey = cfg?.getRepeatedFailureKey ?? (() => null)

  let consecutiveSameCount = 0
  let lastSignature = ''
  let consecutiveErrorCount = 0
  let consecutiveReadOnlyCount = 0
  let lastReadOnlyNudgeAt = 0

  const actionWindow: string[] = []
  const actionWindowMaxSize = maxCyclePeriod * cycleRepeatThreshold
  let lastCycleSignature = ''
  const repeatedFailureCounts = new Map<string, number>()

  function buildCycleFollowUp(cycleActions: string[]): string {
    const customFollowUp = cfg?.buildCycleFollowUp?.(cycleActions)
    if (customFollowUp !== undefined) return customFollowUp

    const cycleText = cycleActions.join(' → ')
    return `[系统循环修复提醒]\n检测到动作进入周期循环：${cycleText}。\n不要重复原动作序列，请切换到另一条已注册工具路径继续。`
  }

  function buildRepeatedFailureFollowUp(key: string, count: number): string {
    const customFollowUp = cfg?.buildRepeatedFailureFollowUp?.(key, count)
    if (customFollowUp !== undefined) return customFollowUp

    return `[系统重复失败提醒]\n目标 "${key}" 已连续 ${count} 次查询失败。\n禁止继续重复同一失败查询，请先回到当前函数目录或参数目录重新选择可用目标。`
  }

  function buildReadOnlyLimitFollowUp(count: number): string {
    const customFollowUp = cfg?.buildReadOnlyLimitFollowUp?.(count)
    if (customFollowUp !== undefined) return customFollowUp

    return `[系统执行节奏提醒]\n当前已连续 ${count} 次只读动作，尚未进入写入。\n请停止继续枚举目录，基于已确认事实执行最小写动作。`
  }

  return {
    name: 'repeat-detection',

    afterStillExecution(ctx: MonitorContext): string[] {
      const action = ctx.currentTurn.toolBlock?.action ?? ''
      const sig = buildSignature(action, ctx.params)
      const result: StillResult = ctx.result

      if (sig === lastSignature) {
        consecutiveSameCount++
      } else {
        consecutiveSameCount = 1
        lastSignature = sig
      }

      if (!result.ok) {
        consecutiveErrorCount++
      } else {
        consecutiveErrorCount = 0
      }

      if (isReadOnlyAction(action)) {
        consecutiveReadOnlyCount++
      } else {
        consecutiveReadOnlyCount = 0
      }

      if (!result.ok) {
        const repeatedFailureKey = getRepeatedFailureKey(ctx)
        if (repeatedFailureKey !== null) {
          const count = (repeatedFailureCounts.get(repeatedFailureKey) ?? 0) + 1
          repeatedFailureCounts.set(repeatedFailureKey, count)
          if (count >= maxRepeatedFailureRetries) {
            return [buildRepeatedFailureFollowUp(repeatedFailureKey, count)]
          }
        }
      }

      actionWindow.push(action)
      if (actionWindow.length > actionWindowMaxSize) {
        actionWindow.shift()
      }

      if (
        maxReadOnlyActions !== undefined
        && maxReadOnlyActions > 0
        && consecutiveReadOnlyCount >= maxReadOnlyActions
        && consecutiveReadOnlyCount % maxReadOnlyActions === 0
        && lastReadOnlyNudgeAt !== consecutiveReadOnlyCount
      ) {
        lastReadOnlyNudgeAt = consecutiveReadOnlyCount
        return [buildReadOnlyLimitFollowUp(consecutiveReadOnlyCount)]
      }

      for (let period = 2; period <= maxCyclePeriod; period++) {
        if (!detectActionCycle(actionWindow, period, cycleRepeatThreshold)) continue
        const cycleActions = actionWindow.slice(-period)
        const cycleSignature = `${period}::${cycleActions.join('::')}`
        if (cycleSignature === lastCycleSignature) return []
        lastCycleSignature = cycleSignature
        return [buildCycleFollowUp(cycleActions)]
      }

      return []
    },

    shouldAbort(ctx: MonitorContext): { abort: boolean; reason?: string } {
      if (consecutiveSameCount >= maxSame) {
        const action = ctx.currentTurn.toolBlock?.action ?? 'unknown'
        return {
          abort: true,
          reason: `动作 ${action} 以相同参数连续执行 ${consecutiveSameCount} 次，疑似死循环`,
        }
      }
      if (consecutiveErrorCount >= maxErrors) {
        return {
          abort: true,
          reason: `连续 ${consecutiveErrorCount} 次执行失败，LLM 无法自我修正`,
        }
      }
      if (
        abortOnReadOnlyLimit
        && maxReadOnlyActions !== undefined
        && maxReadOnlyActions > 0
        && consecutiveReadOnlyCount >= maxReadOnlyActions
      ) {
        return {
          abort: true,
          reason: `连续 ${consecutiveReadOnlyCount} 次只读工具调用仍未写入，已停止本轮以避免编辑会话长时间卡住`,
        }
      }

      return { abort: false }
    },
  }
}
