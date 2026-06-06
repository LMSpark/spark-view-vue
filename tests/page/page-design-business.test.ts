import { describe, expect, it, vi } from 'vitest'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import { resolvePageDesignPlanningContext } from '@/services/page-design-business'

describe('resolvePageDesignPlanningContext', () => {
  it('returns effectiveDescription from readPlanningProjection', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    vi.spyOn(project, 'readPlanningProjection').mockReturnValue([{
      pageId: 'orders',
      path: '/orders',
      title: '订单',
      nodeId: 'orders-node',
      nodeKind: 'page',
      designSurface: 'config-files',
      description: '订单列表',
      descriptionContext: [],
      effectiveDescription: '订单列表页：展示与筛选订单',
    }])

    expect(resolvePageDesignPlanningContext(project, 'orders')).toEqual({
      effectiveDescription: '订单列表页：展示与筛选订单',
      planningTitle: '订单',
      planningPath: '/orders',
    })
  })

  it('uses fallbackDescription when effectiveDescription is empty', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    vi.spyOn(project, 'readPlanningProjection').mockReturnValue([{
      pageId: 'orders',
      path: '/orders',
      title: '订单',
      nodeId: 'orders-node',
      nodeKind: 'page',
      designSurface: 'config-files',
      description: '',
      descriptionContext: [],
      effectiveDescription: '',
    }])

    expect(resolvePageDesignPlanningContext(project, 'orders', {
      fallbackDescription: '本轮需求描述',
    })).toEqual({
      effectiveDescription: '本轮需求描述',
      planningTitle: '订单',
      planningPath: '/orders',
    })
  })

  it('throws when pageId is missing from planning projection', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    vi.spyOn(project, 'readPlanningProjection').mockReturnValue([])

    expect(() => resolvePageDesignPlanningContext(project, 'missing')).toThrow(
      'pageDesign: no planning projection for pageId "missing".',
    )
  })
})
