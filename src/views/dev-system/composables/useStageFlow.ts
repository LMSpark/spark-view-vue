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
 * 检查当前阶段是否建议完成某些工作（软提示，不阻断跳转）。
 *
 * 返回 hint 字段供 UI 展示引导信息，但 allowed 始终为 true。
 */
export function canAdvance(from: ProjectStage, state: ProjectState): AdvanceResult {
  switch (from) {
    case 'requirements':
      if (!state.requirements.some(r => r.status === 'analyzed')) {
        return { allowed: true, hint: '建议先让 AI 分析并确认至少一个需求' }
      }
      return { allowed: true }

    case 'functions':
      if (!state.modules.some(m => m.pages.length > 0)) {
        return { allowed: true, hint: '建议先规划至少一个包含页面的功能模块' }
      }
      return { allowed: true }

    case 'navigation':
      if (state.navDirty) {
        return { allowed: true, hint: '导航结构尚未保存，之后记得保存' }
      }
      return { allowed: true }

    case 'page-design': {
      const activeState = state.activePageId !== null
        ? state.pageDesignStates.get(state.activePageId)
        : undefined
      if (activeState !== undefined && !activeState.proposals.some(p => p.status === 'accepted')) {
        return { allowed: true, hint: '建议先确认至少一个设计方案' }
      }
      return { allowed: true }
    }
    case 'verification':
      return { allowed: true }

    default:
      return { allowed: true }
  }
}

// ── 回退守卫 ──────────────────────────────────────────────────

/**
 * 判断是否可以回退到指定阶段。
 *
 * 始终允许回退（迭代修改），但如果已有下游数据则附带提示。
 */
export function canRegress(to: ProjectStage, state: ProjectState): AdvanceResult {
  if (to === 'requirements' || to === 'functions') {
    const hasDownstreamData =
      state.navRoot.children.length > 0 ||
      state.pageDesignStates.size > 0
    if (hasDownstreamData) {
      return {
        allowed: true,
        hint: '修改早期阶段可能使已有的导航结构和页面设计需要同步调整',
      }
    }
  }
  return { allowed: true }
}

// ── 跳转校验 ──────────────────────────────────────────────────

/**
 * 检查从当前阶段跳转到目标阶段的引导信息。
 *
 * 迭代式工作流：任意阶段之间自由跳转，仅提供软提示。
 */
export function canJumpTo(
  from: ProjectStage,
  to: ProjectStage,
  state: ProjectState,
): AdvanceResult {
  if (stageIndex(from) === stageIndex(to)) {
    return { allowed: true }
  }

  if (stageIndex(to) > stageIndex(from)) {
    return canAdvance(from, state)
  }

  return canRegress(to, state)
}

/**
 * 判断指定阶段是否已有内容（用于 UI 区分已编辑/空白阶段）。
 */
export function hasStageContent(stage: ProjectStage, state: ProjectState): boolean {
  switch (stage) {
    case 'requirements':
      return state.requirements.length > 0
    case 'functions':
      return state.modules.length > 0
    case 'navigation':
      return state.navRoot.children.length > 0
    case 'page-design':
      return state.pageDesignStates.size > 0
    case 'verification':
      return false
    default:
      return false
  }
}
