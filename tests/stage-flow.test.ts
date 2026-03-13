/**
 * 阶段流转守卫测试
 */
import { describe, it, expect } from 'vitest'
import {
  canAdvance,
  canRegress,
  canJumpTo,
  stageIndex,
  isFirstStage,
  isLastStage,
  nextStage,
  prevStage,
} from '@/views/dev-system/composables/useStageFlow'
import type { ProjectState, AdvanceResult } from '@/views/dev-system/composables/types'
import type { DesignProposal } from '@/composables/useDesignSession'

/** Extract hint from an AdvanceResult (for test assertions) */
function getHint(r: AdvanceResult): string | undefined {
  return r.allowed ? r.hint : undefined
}

// ── Helper：创建最小 ProjectState ─────────────────────────────

function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    currentStage: 'requirements',
    workFocus: { view: 'overview' },
    requirements: [],
    activeRequirementId: null,
    modules: [],
    navRoot: { childPlacement: 'header', children: [] },
    navDirty: false,
    activePageId: null,
    pageDesignStates: new Map(),
    aiPanelVisible: true,
    aiContext: { stage: 'requirements', targetId: null, systemPrompt: '', contextData: '' },
    globalChatHistory: {},
    lastUpdated: new Date().toISOString(),
    ...overrides,
  }
}

function makeProposal(status: string): DesignProposal {
  return {
    id: crypto.randomUUID(),
    type: 'ui-structure',
    title: 'test',
    content: '{}',
    status: status as DesignProposal['status'],
    messageId: '1',
    stage: 'page-design',
    timestamp: new Date(),
  }
}

// ── 索引工具 ──────────────────────────────────────────────────

describe('stageIndex utilities', () => {
  it('returns correct index for each stage', () => {
    expect(stageIndex('requirements')).toBe(0)
    expect(stageIndex('functions')).toBe(1)
    expect(stageIndex('navigation')).toBe(2)
    expect(stageIndex('page-design')).toBe(3)
    expect(stageIndex('verification')).toBe(4)
  })

  it('isFirstStage / isLastStage', () => {
    expect(isFirstStage('requirements')).toBe(true)
    expect(isFirstStage('functions')).toBe(false)
    expect(isLastStage('verification')).toBe(true)
    expect(isLastStage('page-design')).toBe(false)
  })

  it('nextStage / prevStage', () => {
    expect(nextStage('requirements')).toBe('functions')
    expect(nextStage('verification')).toBeNull()
    expect(prevStage('requirements')).toBeNull()
    expect(prevStage('functions')).toBe('requirements')
  })
})

// ── canAdvance ────────────────────────────────────────────────

describe('canAdvance', () => {
  it('requirements → functions: hints if no analyzed requirement', () => {
    const state = makeState({ requirements: [{ id: '1', title: 't', description: 'd', status: 'draft', relatedModules: [], createdAt: '' }] })
    const result = canAdvance('requirements', state)
    expect(result.allowed).toBe(true)
    expect(getHint(result)).toBeTruthy()
  })

  it('requirements → functions: passes with analyzed requirement', () => {
    const state = makeState({
      requirements: [{ id: '1', title: 't', description: 'd', status: 'analyzed', relatedModules: [], createdAt: '' }],
    })
    const result = canAdvance('requirements', state)
    expect(result.allowed).toBe(true)
  })

  it('functions → navigation: hints if no module with pages', () => {
    const state = makeState({
      modules: [{ id: '1', name: 'm', icon: '', description: '', pages: [], requirementId: '1', status: 'planned' }],
    })
    const result = canAdvance('functions', state)
    expect(result.allowed).toBe(true)
    expect(getHint(result)).toBeTruthy()
  })

  it('functions → navigation: passes with module containing pages', () => {
    const state = makeState({
      modules: [{
        id: '1', name: 'm', icon: '', description: '',
        pages: [{ pageId: 'p1', title: 't', description: 'd', pageType: 'list', dataEntities: [], status: 'planned' }],
        requirementId: '1', status: 'planned',
      }],
    })
    const result = canAdvance('functions', state)
    expect(result.allowed).toBe(true)
  })

  it('navigation → page-design: hints if navDirty', () => {
    const state = makeState({ navDirty: true })
    const result = canAdvance('navigation', state)
    expect(result.allowed).toBe(true)
    expect(getHint(result)).toBeTruthy()
  })

  it('navigation → page-design: passes if not dirty', () => {
    const state = makeState({ navDirty: false })
    const result = canAdvance('navigation', state)
    expect(result.allowed).toBe(true)
  })

  it('page-design → verification: hints if no accepted proposal', () => {
    const pageStates = new Map()
    pageStates.set('p1', { pageId: 'p1', proposals: [makeProposal('pending')], phase: 'discussing', chatHistory: [] })
    const state = makeState({ activePageId: 'p1', pageDesignStates: pageStates })
    const result = canAdvance('page-design', state)
    expect(result.allowed).toBe(true)
    expect(getHint(result)).toBeTruthy()
  })

  it('page-design → verification: passes with accepted proposal', () => {
    const pageStates = new Map()
    pageStates.set('p1', { pageId: 'p1', proposals: [makeProposal('accepted')], phase: 'discussing', chatHistory: [] })
    const state = makeState({ activePageId: 'p1', pageDesignStates: pageStates })
    const result = canAdvance('page-design', state)
    expect(result.allowed).toBe(true)
  })

  it('verification: always passes (last stage)', () => {
    const state = makeState()
    const result = canAdvance('verification', state)
    expect(result.allowed).toBe(true)
  })
})

// ── canRegress ────────────────────────────────────────────────

describe('canRegress', () => {
  it('regressing to requirements with downstream data warns', () => {
    const state = makeState({
      navRoot: { childPlacement: 'header', children: [{ id: '1', title: 't' } as any] },
    })
    const result = canRegress('requirements', state)
    expect(result.allowed).toBe(true)
    expect(getHint(result)).toBeTruthy()
  })

  it('regressing to functions with page design states warns', () => {
    const pageStates = new Map()
    pageStates.set('p1', { pageId: 'p1', proposals: [], phase: 'discussing', chatHistory: [] })
    const state = makeState({ pageDesignStates: pageStates })
    const result = canRegress('functions', state)
    expect(result.allowed).toBe(true)
    expect(getHint(result)).toBeTruthy()
  })

  it('regressing to requirements with no downstream data is fine', () => {
    const state = makeState()
    const result = canRegress('requirements', state)
    expect(result.allowed).toBe(true)
  })

  it('regressing to navigation always allowed', () => {
    const state = makeState()
    const result = canRegress('navigation', state)
    expect(result.allowed).toBe(true)
  })
})

// ── canJumpTo ─────────────────────────────────────────────────

describe('canJumpTo', () => {
  it('same stage: always allowed', () => {
    const state = makeState()
    expect(canJumpTo('requirements', 'requirements', state).allowed).toBe(true)
  })

  it('skip forward: allowed with hint', () => {
    const state = makeState()
    const result = canJumpTo('requirements', 'navigation', state)
    expect(result.allowed).toBe(true)
  })

  it('adjacent forward: delegates to canAdvance', () => {
    const state = makeState({
      requirements: [{ id: '1', title: 't', description: 'd', status: 'analyzed', relatedModules: [], createdAt: '' }],
    })
    const result = canJumpTo('requirements', 'functions', state)
    expect(result.allowed).toBe(true)
  })

  it('backward: delegates to canRegress', () => {
    const state = makeState()
    const result = canJumpTo('navigation', 'requirements', state)
    expect(result.allowed).toBe(true)
  })
})
