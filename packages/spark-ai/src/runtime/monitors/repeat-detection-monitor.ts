/**
 * Repeat Detection Monitor — 重复检测监控器
 *
 * 编排关注点：
 * 1. 同一 action+params 签名连续出现 ≥ N 次 → 终止（LLM 进入死循环）
 * 2. 连续失败 ≥ N 次 → 终止（LLM 无法自我修正）
 *
 * 不关心具体是什么 action —— 纯编排层决策。
 */

import type { MonitorContext, SessionMonitor } from '../session-orchestrator'

interface RepeatDetectionConfig {
  /** 同签名最大允许次数（默认 3） */
  maxSameSignature?: number
  /** 连续失败最大允许次数（默认 3） */
  maxConsecutiveErrors?: number
}

function buildSignature(action: string, params: unknown): string {
  try {
    return `${action}::${JSON.stringify(params)}`
  } catch {
    return `${action}::unstringifiable`
  }
}

export function createRepeatDetectionMonitor(
  cfg?: RepeatDetectionConfig,
): SessionMonitor {
  const maxSame = cfg?.maxSameSignature ?? 3
  const maxErrors = cfg?.maxConsecutiveErrors ?? 3

  // 滚动状态——监控器实例与循环同生命周期
  let consecutiveSameCount = 0
  let lastSignature = ''
  let consecutiveErrorCount = 0

  return {
    name: 'repeat-detection',

    afterStillExecution(ctx: MonitorContext): string[] {
      const action = ctx.currentTurn.toolBlock?.action ?? ''
      const sig = buildSignature(action, ctx.params)

      // ── 同签名计数 ──
      if (sig === lastSignature) {
        consecutiveSameCount++
      } else {
        consecutiveSameCount = 1
        lastSignature = sig
      }

      // ── 连续错误计数 ──
      if (!ctx.result.ok) {
        consecutiveErrorCount++
      } else {
        consecutiveErrorCount = 0
      }

      return [] // 不注入 followUp（终止由 shouldAbort 处理）
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
      return { abort: false }
    },
  }
}
