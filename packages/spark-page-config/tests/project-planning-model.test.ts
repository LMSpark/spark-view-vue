import { describe, expect, it } from 'vitest'
import {
  ProjectConfigPageNodeModel,
  ProjectNodeCollection,
  ProjectPlanningModel,
} from '@spark-view/spark-page-config/project'
import { createRequest } from '@spark-view/spark-utils'
import { buildNavRoot } from '../src/page-model/navigation/nav-editing'
import { PageNodeFileApi } from '../src/page-model/model/page-file-api'
import { PageNodeFileCache } from '../src/page-model/model/page-file-cache'
import { PageContentLoader } from '../src/page-model/read/page-content-loader'

describe('ProjectPlanningModel', () => {
  function createNodeCollection(): ProjectNodeCollection {
    const http = createRequest()
    const contentLoader = new PageContentLoader({
      fileStorage: 'memory',
      httpClient: http,
    })
    return new ProjectNodeCollection({
      fileApi: new PageNodeFileApi({
        getPageFilesApi: () => '/api/pages-config',
        http,
      }),
      fileCache: new PageNodeFileCache({
        contentLoaderFactory: () => contentLoader,
      }),
      contentLoaderFactory: () => contentLoader,
    })
  }

  it('uses one config page node model for page and sub-page nodes', () => {
    const nodes = createNodeCollection()
    nodes.replaceRoot(buildNavRoot([
      {
        id: 'orders-node',
        title: '订单页面',
        nodeKind: 'page',
        path: '/orders',
        children: [
          {
            id: 'order-detail',
            title: '订单详情',
            nodeKind: 'sub-page',
            description: '订单详情功能：展示订单明细。',
          },
        ],
      },
    ]))

    const page = nodes.findConfigPageByPageId('orders')
    const subPage = nodes.findConfigPageByPageId('order-detail')

    expect(page).toBeInstanceOf(ProjectConfigPageNodeModel)
    expect(subPage).toBeInstanceOf(ProjectConfigPageNodeModel)
    expect(page?.nodeKind).toBe('page')
    expect(subPage?.nodeKind).toBe('sub-page')
    expect(subPage?.pageId).toBe('order-detail')
  })

  it('models project planning as module plans plus page plans with inherited requirements', () => {
    const nodes = createNodeCollection()
    nodes.replaceRoot(buildNavRoot([
      {
        id: 'sales',
        title: '销售模块',
        nodeKind: 'module',
        description: '销售模块约束：围绕客户、订单、回款闭环。',
        children: [
          {
            id: 'orders',
            title: '订单页面',
            nodeKind: 'page',
            path: '/orders',
            description: '订单页面功能：维护订单主数据。',
            children: [
              {
                id: 'order-detail',
                title: '订单详情',
                nodeKind: 'sub-page',
                description: '订单详情功能：展示订单明细和审批轨迹。',
                children: [
                  {
                    id: 'order-audit',
                    title: '订单审计',
                    nodeKind: 'sub-page',
                    description: '订单审计功能：追溯字段变更历史。',
                  },
                ],
              },
              {
                id: 'illegal-page-module',
                title: '页面下非法模块',
                nodeKind: 'module',
                description: '页面下不应出现模块策划。',
              },
            ],
          },
          {
            id: 'sales-report',
            title: '销售报表',
            nodeKind: 'page',
            path: '/sales-report',
            description: '销售报表功能：汇总销售指标。',
          },
        ],
      },
      {
        id: 'landing',
        title: '项目首页',
        nodeKind: 'page',
        path: '/landing',
        description: '项目首页功能：呈现项目入口和待办。',
        children: [
          {
            id: 'landing-child',
            title: '首页子页面',
            nodeKind: 'sub-page',
            description: '首页子页面功能：展示待办详情。',
          },
        ],
      },
    ]))

    const planning = new ProjectPlanningModel({
      projectId: 'crm',
      nodes,
      projectRequirement: 'CRM 项目约束：支撑销售作业全流程。',
    })

    const projectPlan = planning.readProjectPlanning()
    expect(projectPlan.modulePlans.map(plan => plan.nodeId)).toEqual(['sales'])
    expect(projectPlan.pagePlans.map(plan => plan.nodeId)).toEqual(['landing'])

    const salesPlan = projectPlan.modulePlans[0]
    expect(salesPlan?.modulePlans).toEqual([])
    expect(salesPlan?.pagePlans.map(plan => plan.nodeId)).toEqual(['orders', 'sales-report'])

    const ordersPlan = salesPlan?.pagePlans[0]
    expect(ordersPlan?.subPagePlans.map(plan => plan.nodeId)).toEqual(['order-detail'])
    expect(ordersPlan?.subPagePlans[0]?.subPagePlans.map(plan => plan.nodeId)).toEqual(['order-audit'])
    expect(ordersPlan?.subPagePlans.some(plan => plan.nodeId === 'illegal-page-module')).toBe(false)

    const orderDetailFeature = planning.readPageFeature('order-detail')
    expect(orderDetailFeature?.description).toBe('订单详情功能：展示订单明细和审批轨迹。')
    expect(orderDetailFeature?.requirementConstraints.map(item => item.nodeId)).toEqual([
      'crm',
      'sales',
      'orders',
      'order-detail',
    ])
    expect(orderDetailFeature?.effectiveUserRequirement).toContain('CRM 项目约束')
    expect(orderDetailFeature?.effectiveUserRequirement).toContain('销售模块约束')
    expect(orderDetailFeature?.effectiveUserRequirement).toContain('订单页面功能')
    expect(orderDetailFeature?.effectiveUserRequirement).toContain('订单详情功能')
  })
})
