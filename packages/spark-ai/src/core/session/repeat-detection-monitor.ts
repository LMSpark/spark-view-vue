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
  maxMissingComponentRetries?: number
  maxCyclePeriod?: number
  cycleRepeatThreshold?: number
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

const NODE_TREE_WRITE_ACTIONS = new Set([
  'sparkNodeTree.addNode',
  'sparkNodeTree.addNodes',
  'sparkNodeTree.moveNode',
  'sparkNodeTree.setProps',
  'sparkNodeTree.setPropsBatch',
  'sparkNodeTree.replaceNode',
  'sparkNodeTree.replaceNodes',
  'sparkNodeTree.removeNode',
  'sparkNodeTree.removeNodes',
])

function isDatasetReadAction(action: string): boolean {
  if (action === 'dataset.export') return true
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
  if (action === 'queryComponentCatalog' || action === 'queryComponentGuide') {
    return true
  }

  if (action.startsWith('catalog.') || action.startsWith('session.') || action.startsWith('stills.')) {
    return true
  }

  if (action.startsWith('sparkNodeTree.')) {
    return !NODE_TREE_WRITE_ACTIONS.has(action)
  }

  if (action.startsWith('textModel.')) {
    return action.startsWith('textModel.read')
  }

  if (isDatasetReadAction(action)) {
    return true
  }

  return false
}

function extractCatalogGuideType(params: unknown): string | null {
  if (typeof params !== 'object' || params === null) return null
  const record = params as Record<string, unknown>
  const candidate = record['type'] ?? record['componentType']
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

  let consecutiveSameCount = 0
  let lastSignature = ''
  let consecutiveErrorCount = 0
  let consecutiveReadOnlyCount = 0
  let lastReadOnlyNudgeAt = 0

  const actionWindow: string[] = []
  const actionWindowMaxSize = maxCyclePeriod * cycleRepeatThreshold
  let lastCycleSignature = ''
  const missingComponentTypeCounts = new Map<string, number>()
  let datasetExportMigrationNudged = false

  function buildCycleFollowUp(cycleActions: string[]): string {
    const cycleText = cycleActions.join(' → ')
    return `[系统循环修复提醒]\n检测到动作进入周期循环：${cycleText}。\n不要重复原动作序列，请立即改用另一条路径继续：\n1) 先调用 queryComponentCatalog({ componentType: "*" }) 或 catalog.query 重新确认可用组件清单；\n2) 对不存在的组件 type 不再重复 queryComponentGuide/catalog.guide 盲试；\n3) 若是节点写动作失败，先用 sparkNodeTree.findByType 或 listChildren/getNode 拿到真实 id，再执行写入。`
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

      if ((action === 'catalog.guide' || action === 'queryComponentGuide') && !result.ok && result.code === 'NOT_FOUND') {
        const missingType = extractCatalogGuideType(ctx.params)
        if (missingType) {
          const count = (missingComponentTypeCounts.get(missingType) ?? 0) + 1
          missingComponentTypeCounts.set(missingType, count)
          if (count >= maxMissingComponentRetries) {
            return [
              `[系统组件替换提醒]\n组件 type "${missingType}" 已连续 ${count} 次查询失败（NOT_FOUND）。\n禁止继续对该 type 重复调用 queryComponentGuide/catalog.guide。\n请先 queryComponentCatalog({ componentType: "*" }) 或 catalog.query 重新选择可用组件，再继续后续写动作。`,
            ]
          }
        }
      }

      if (
        action === 'datasetTool.export'
        && !result.ok
        && datasetExportMigrationNudged === false
      ) {
        datasetExportMigrationNudged = true
        return [
          '[系统动作迁移提醒]\ndatasetTool.export 在当前数据优先流程中已禁用。\n请立即改用 dataset.export（参数为 {}），不要继续重试 datasetTool.export。',
        ]
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
        return [
          `[系统执行节奏提醒]\n当前已连续 ${consecutiveReadOnlyCount} 次只读动作（catalog/query/get/list/read），尚未进入写入。\n请停止继续枚举组件目录，立即基于已确认的组件执行最小写动作；若组件不存在，先替换为 catalog.query 可用组件后再写入。`,
        ]
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

      return { abort: false }
    },
  }
}
