/**
 * 阶段流转控制 — canAdvance / canRegress 守卫
 *
 * 纯函数，不依赖 Vue 响应式，方便单元测试。
 */
import type { ProjectState, ProjectStage, AdvanceResult } from './types'
import { STAGE_ORDER } from './types'

// ── 阶段索引工具 ──────────────────────────────────────────────

export function stageIndex(stage: ProjectStage): number {
  return STAGE_ORDER.indexOf(stage)
}

export function isFirstStage(stage: ProjectStage): boolean {
  return stageIndex(stage) === 0
}

export function isLastStage(stage: ProjectStage): boolean {
  return stageIndex(stage) === STAGE_ORDER.length - 1
}

export function nextStage(stage: ProjectStage): ProjectStage | null {
  const idx = stageIndex(stage)
  return idx < STAGE_ORDER.length - 1 ? (STAGE_ORDER[idx + 1] ?? null) : null
}

export function prevStage(stage: ProjectStage): ProjectStage | null {
  const idx = stageIndex(stage)
  return idx > 0 ? (STAGE_ORDER[idx - 1] ?? null) : null
}

// ── 前进守卫 ──────────────────────────────────────────────────

/**
 * 判断是否可以从当前阶段前进到下一阶段。
 *
 * 规则：
 * - requirements → functions: 至少有一个 status='analyzed' 的需求
 * - functions → navigation: 至少有一个带页面的模块
 * - navigation → page-design: navDirty 必须为 false（已保存）
 * - page-design → verification: 当前页面至少有一个已采纳的 proposal
 */
export function canAdvance(from: ProjectStage, state: ProjectState): AdvanceResult {
  switch (from) {
    case 'requirements':
      if (!state.requirements.some(r => r.status === 'analyzed')) {
        return { allowed: false, reason: '请先让 AI 分析并确认至少一个需求' }
      }
      return { allowed: true }

    case 'functions':
      if (!state.modules.some(m => m.pages.length > 0)) {
        return { allowed: false, reason: '请先规划至少一个包含页面的功能模块' }
      }
      return { allowed: true }

    case 'navigation':
      if (state.navDirty) {
        return { allowed: false, reason: '请先保存导航结构到后端' }
      }
      return { allowed: true }

    case 'page-design': {
      const ps = state.pageDesignStates.get(state.activePageId ?? '')
      if (!ps?.proposals.some(p => p.status === 'accepted')) {
        return { allowed: false, reason: '请先采纳至少一个设计提案' }
      }
      return { allowed: true }
    }

    case 'verification':
      // 最后一个阶段，无需前进
      return { allowed: true }

    default:
      return { allowed: true }
  }
}

// ── 回退守卫 ──────────────────────────────────────────────────

/**
 * 判断是否可以回退到指定阶段。
 *
 * 规则：
 * - 回退到 requirements 或 functions 时，如果已有下游数据，
 *   返回 allowed: false + 警告原因（由 UI 层弹确认框后强制放行）。
 * - 其他回退自由允许。
 */
export function canRegress(to: ProjectStage, state: ProjectState): AdvanceResult {
  if (to === 'requirements' || to === 'functions') {
    const hasDownstreamData =
      state.navRoot.children.length > 0 ||
      state.pageDesignStates.size > 0
    if (hasDownstreamData) {
      return {
        allowed: false,
        reason: '修改模块规划可能使已有的导航结构和页面设计失效，是否继续？',
      }
    }
  }
  return { allowed: true }
}

// ── 跳转校验 ──────────────────────────────────────────────────

/**
 * 检查是否允许从当前阶段跳转到目标阶段。
 *
 * 规则：
 * - 相邻前进：canAdvance
 * - 跳跃前进：禁止（必须逐步完成）
 * - 任意回退：canRegress
 * - 同阶段：允许
 */
export function canJumpTo(
  from: ProjectStage,
  to: ProjectStage,
  state: ProjectState,
): AdvanceResult {
  const fromIdx = stageIndex(from)
  const toIdx = stageIndex(to)

  if (fromIdx === toIdx) {
    return { allowed: true }
  }

  if (toIdx > fromIdx) {
    // 前进：只允许相邻
    if (toIdx - fromIdx > 1) {
      return { allowed: false, reason: '必须逐步完成各阶段，不能跳跃前进' }
    }
    return canAdvance(from, state)
  }

  // 回退
  return canRegress(to, state)
}
