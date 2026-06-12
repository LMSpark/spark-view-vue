import { describe, expect, it } from 'vitest'
import type { ProjectPageNodeSummary } from '@spark-appworks/spark-project-model'
import { evaluatePageDataDesignToolGate } from '@/services/page-data-design-gates'

function createSummary(overrides: Partial<ProjectPageNodeSummary> = {}): ProjectPageNodeSummary {
  return {
    pageId: 'orders',
    nodeId: 'orders',
    nodeKind: 'page',
    designSurface: 'config-files',
    title: 'Orders',
    path: '/orders',
    description: '订单列表页',
    descriptionContext: [],
    effectiveDescription: '订单列表页',
    planningStatus: 'planning_confirmed',
    implGate: 'open',
    upstreamContractsSatisfied: true,
    ...overrides,
  }
}

describe('evaluatePageDataDesignToolGate', () => {
  it('allows model_script that only uses editDataSet', () => {
    const result = evaluatePageDataDesignToolGate({
      toolName: 'model_script',
      summary: createSummary(),
      args: {
        script: [
          'const page = await this.openPageDesign({ pageId: "orders" })',
          'await page.editDataSet(tool => tool.addTable({ id: "orders", title: "Orders" }))',
        ].join('\n'),
      },
    })
    expect(result.ok).toBe(true)
  })

  it('rejects model_script that calls editNodeTree', () => {
    const result = evaluatePageDataDesignToolGate({
      toolName: 'model_script',
      summary: createSummary(),
      args: {
        script: 'await this.openPageDesign({ pageId: "orders" }).editNodeTree(t => t)',
      },
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('editNodeTree')
  })

  it('rejects run when planning is still draft', () => {
    const result = evaluatePageDataDesignToolGate({
      toolName: 'model_script',
      summary: createSummary({
        planningStatus: 'planning_draft',
        effectiveDescription: '',
      }),
      args: { script: 'await this.openPageDesign({ pageId: "orders" }).editDataSet(() => {})' },
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('planning_draft')
  })
})
