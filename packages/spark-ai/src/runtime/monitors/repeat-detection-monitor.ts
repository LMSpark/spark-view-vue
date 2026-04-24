/**
 * Repeat Detection Monitor — 重复检测监控器
 *
 * 编排关注点：
 * 1. 同一 action+params 签名连续出现 ≥ N 次 → 终止（LLM 进入死循环）
 * 2. 连续失败 ≥ N 次 → 终止（LLM 无法自我修正）
 * 3. action 名称周期性交替循环（A→B→A→B→A…）≥ N 周期 → 终止（LLM 漫游式死循环）
 *
 * 不关心具体是什么 action —— 纯编排层决策。
 */

import type { MonitorContext, SessionMonitor } from '../../session-contracts'

interface RepeatDetectionConfig {
  /** 同签名最大允许次数（默认 3） */
  maxSameSignature?: number
  /** 连续失败最大允许次数（默认 3） */
  maxConsecutiveErrors?: number
  /** 连续只读动作最大允许次数（未配置则不启用） */
  maxReadOnlyActions?: number
  /** 同一不存在组件 type 允许重试 catalog.guide 的次数（默认 2） */
  maxMissingComponentRetries?: number
  /**
   * 周期性交替循环中单个周期的最大检测长度（默认 3）。
   * 例如 period=2 检测 A→B→A→B→A，period=3 检测 A→B→C→A→B→C→A。
   */
  maxCyclePeriod?: number
  /** 交替循环触发中止所需的周期重复次数（默认 3）。 */
  cycleRepeatThreshold?: number
}

function buildSignature(action: string, params: unknown): string {
  try {
    return `${action}::${JSON.stringify(params)}`
  } catch {
    return `${action}::unstringifiable`
  }
}

/**
 * 检测 actionWindow 尾部是否存在长度为 period 的重复周期（重复 repeatThreshold 次）。
 * 仅比较 action 名称，忽略参数差异。
 */
function detectActionCycle(
  actionWindow: string[],
  period: number,
  repeatThreshold: number,
): boolean {
  const needed = period * repeatThreshold
  if (actionWindow.length < needed) return false

  const tail = actionWindow.slice(-needed)
  const baseCycle = tail.slice(0, period)
  // 至少包含 2 个不同动作才视为“交替循环”；
  // 纯同动作重复应交由 same-signature / consecutive-errors 规则处理，避免误伤正常 catalog.guide 扫描。
  if (new Set(baseCycle).size < 2) return false

  // 校验 tail 的每个位置 i 是否满足 tail[i] === tail[i % period]
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] !== tail[i % period]) return false
  }
  return true
}

const NODE_TREE_WRITE_ACTIONS = new Set([
  'sparkNodeTree.addNode',
  'sparkNodeTree.addNodes',
  'sparkNodeTree.setProps',
  'sparkNodeTree.setPropsBatch',
  'sparkNodeTree.replaceNode',
  'sparkNodeTree.replaceNodes',
  'sparkNodeTree.removeNode',
  'sparkNodeTree.removeNodes',
])

function isDatasetReadAction(action: string): boolean {
  if (!action.startsWith('datasetTool.')) return false
  return (
    action === 'datasetTool.export'
    || action === 'datasetTool.historyCursor'
    || action.startsWith('datasetTool.can')
    || action.startsWith('datasetTool.get')
    || action.startsWith('datasetTool.list')
  )
}

function isReadOnlyAction(action: string): boolean {
  if (action.startsWith('catalog.') || action.startsWith('session.') || action.startsWith('stills.')) {
    return true
  }

  if (action.startsWith('sparkNodeTree.')) {
    return !NODE_TREE_WRITE_ACTIONS.has(action)
  }

  if (action.startsWith('textModel.')) {
    return action.startsWith('textModel.read')
  }

  if (action === 'edit.changedLines' || action === 'dataset.changedLines') {
    return true
  }

  if (isDatasetReadAction(action)) {
    return true
  }

  return false
}

function extractCatalogGuideType(params: unknown): string | null {
  if (typeof params !== 'object' || params === null) return null
  const candidate = (params as Record<string, unknown>)['type']
  if (typeof candidate !== 'string') return null
  const normalized = candidate.trim()
  return normalized.length > 0 ? normalized : null
}

export function createRepeatDetectionMonitor(
  cfg?: RepeatDetectionConfig,
): SessionMonitor {
  const maxSame = cfg?.maxSameSignature ?? 3
  const maxErrors = cfg?.maxConsecutiveErrors ?? 3
  const maxReadOnlyActions = cfg?.maxReadOnlyActions
  const maxMissingComponentRetries = cfg?.maxMissingComponentRetries ?? 2
  const maxCyclePeriod = cfg?.maxCyclePeriod ?? 3
  const cycleRepeatThreshold = cfg?.cycleRepeatThreshold ?? 3

  // 滚动状态——监控器实例与循环同生命周期
  let consecutiveSameCount = 0
  let lastSignature = ''
  let consecutiveErrorCount = 0
  let consecutiveReadOnlyCount = 0
  let lastReadOnlyNudgeAt = 0

  // 用于周期检测的 action 名称滑动窗口
  const actionWindow: string[] = []
  const actionWindowMaxSize = maxCyclePeriod * cycleRepeatThreshold
  let lastCycleSignature = ''
  const missingComponentTypeCounts = new Map<string, number>()

  function buildCycleFollowUp(cycleActions: string[]): string {
    const cycleText = cycleActions.join(' → ')
    return `[系统循环修复提醒]\n检测到动作进入周期循环：${cycleText}。\n不要重复原动作序列，请立即改用另一条路径继续：\n1) 先调用 catalog.query（可带 category）重新确认可用组件清单；\n2) 对不存在的组件 type 不再重复 catalog.guide 盲试；\n3) 若是节点写动作失败，先用 sparkNodeTree.findByType 或 listChildren/getNode 拿到真实 id，再执行写入。`
  }

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

      // ── 连续只读计数（用于抑制“只查不写”的漫游） ──
      if (isReadOnlyAction(action)) {
        consecutiveReadOnlyCount++
      } else {
        consecutiveReadOnlyCount = 0
      }

      // ── catalog.guide 不存在组件重试守卫 ──
      if (action === 'catalog.guide' && !ctx.result.ok && ctx.result.code === 'NOT_FOUND') {
        const missingType = extractCatalogGuideType(ctx.params)
        if (missingType) {
          const count = (missingComponentTypeCounts.get(missingType) ?? 0) + 1
          missingComponentTypeCounts.set(missingType, count)
          if (count >= maxMissingComponentRetries) {
            return [
              `[系统组件替换提醒]\n组件 type "${missingType}" 已连续 ${count} 次查询失败（NOT_FOUND）。\n禁止继续对该 type 重复调用 catalog.guide。\n请先 catalog.query 重新选择可用组件，再继续后续写动作。`,
            ]
          }
        }
      }

      // ── 周期 action 窗口维护 ──
      actionWindow.push(action)
      if (actionWindow.length > actionWindowMaxSize) {
        actionWindow.shift()
      }

      if (
        maxReadOnlyActions !== undefined
        && maxReadOnlyActions > 0
        && consecutiveReadOnlyCount >= maxReadOnlyActions
        && lastReadOnlyNudgeAt !== consecutiveReadOnlyCount
      ) {
        lastReadOnlyNudgeAt = consecutiveReadOnlyCount
        return [
          `[系统执行节奏提醒]\n当前已连续 ${consecutiveReadOnlyCount} 次只读动作（catalog/query/get/list/read），尚未进入写入。\n请停止继续枚举组件目录，立即基于已确认的组件执行最小写动作；若组件不存在，先替换为 catalog.query 可用组件后再写入。`,
        ]
      }

      // 周期循环不再直接中止，改为注入纠错指令，要求 LLM 换路径继续。
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
        maxReadOnlyActions !== undefined
        && maxReadOnlyActions > 0
        && consecutiveReadOnlyCount >= maxReadOnlyActions * 2
      ) {
        return {
          abort: true,
          reason: `连续 ${consecutiveReadOnlyCount} 次只读动作未进入写入，疑似目录探测漫游`,
        }
      }

      return { abort: false }
    },
  }
}

