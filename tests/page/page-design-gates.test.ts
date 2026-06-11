import { describe, expect, it } from 'vitest'
import {
  assertPageDesignRunGateAllowed,
  evaluatePageDesignMutationToolGate,
  isPageDesignMutationTool,
  readPageDesignGateState,
  validatePageDesignRunGate,
} from '@/services/page-design-gates'
import type { ProjectPageNodeSummary } from '@spark-appworks/spark-project-model'

function createSummary(
  overrides: Partial<ProjectPageNodeSummary> = {},
): ProjectPageNodeSummary {
  return {
    pageId: 'orders',
    path: '/orders',
    title: '订单',
    nodeId: 'orders-node',
    nodeKind: 'page',
    designSurface: 'config-files',
    description: '订单列表',
    descriptionContext: [],
    effectiveDescription: '订单列表页',
    ...overrides,
  }
}

describe('readPageDesignGateState', () => {
  it('infers planning_confirmed from effectiveDescription when planningStatus omitted', () => {
    expect(readPageDesignGateState(createSummary()).planningStatus).toBe('planning_confirmed')
  })

  it('defaults implGate to open when field omitted', () => {
    expect(readPageDesignGateState(createSummary()).implGate).toBe('open')
  })

  it('treats missing implGate as closed in strict mode', () => {
    expect(readPageDesignGateState(createSummary(), { strictImplGate: true }).implGate).toBe('closed')
  })
})

describe('validatePageDesignRunGate', () => {
  it('rejects planning_draft', () => {
    const result = validatePageDesignRunGate({
      pageId: 'orders',
      planningStatus: 'planning_draft',
      implGate: 'open',
      upstreamContractsSatisfied: true,
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('PLANNING_DRAFT')
  })

  it('rejects closed impl gate', () => {
    const result = validatePageDesignRunGate({
      pageId: 'orders',
      planningStatus: 'planning_confirmed',
      implGate: 'closed',
      upstreamContractsSatisfied: true,
    })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('IMPL_GATE_CLOSED')
  })

  it('allows confirmed + open gate', () => {
    expect(validatePageDesignRunGate({
      pageId: 'orders',
      planningStatus: 'planning_confirmed',
      implGate: 'open',
      upstreamContractsSatisfied: true,
    }).ok).toBe(true)
  })
})

describe('assertPageDesignRunGateAllowed', () => {
  it('throws when impl gate is closed', () => {
    expect(() => assertPageDesignRunGateAllowed(createSummary({ implGate: 'closed' }))).toThrow(/implGate=closed/u)
  })
})

describe('evaluatePageDesignMutationToolGate', () => {
  it('allows read-only tools when gate is closed', () => {
    const summary = createSummary({ implGate: 'closed' })
    expect(evaluatePageDesignMutationToolGate({
      toolName: 'model_class_guide',
      summary,
    }).ok).toBe(true)
  })

  it('rejects model_script when gate is closed', () => {
    const summary = createSummary({ implGate: 'closed' })
    expect(evaluatePageDesignMutationToolGate({
      toolName: 'model_script',
      summary,
    }).ok).toBe(false)
  })
})

describe('isPageDesignMutationTool', () => {
  it('detects model_script and writePageFile', () => {
    expect(isPageDesignMutationTool('model_script')).toBe(true)
    expect(isPageDesignMutationTool('writePageFile')).toBe(true)
    expect(isPageDesignMutationTool('model_class_guide')).toBe(false)
  })
})
