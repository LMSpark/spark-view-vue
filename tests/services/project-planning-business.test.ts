import { describe, expect, it } from 'vitest'
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { ProjectModel } from '@spark-appworks/spark-project-model'
import { vi } from 'vitest'
import {
  ensureProjectPlanningBusiness,
  filterNavigationPlanningRunNodes,
  formatProjectPlanningPromptContext,
  PROJECT_PLANNING_MODULE_ID,
  resolveNavigationPlanningRunInput,
  resolveProjectPlanningRunInput,
  resolveScopedProjectPlanningRunInput,
} from '@/services/project-planning-business'
import { evaluateProjectPlanningToolGate } from '@/services/project-planning-gates'
import { projectModelRuntimeMetadataDocument } from '../../generated/vcm/project-model/project-model-module-metadata.runtime'

vi.mock('@/services/project-planning-vcm-knowledge-provider', () => ({
  createProjectPlanningVcmKnowledgeProvider: () => ({
    query: vi.fn(),
    modelGuide: vi.fn(),
    attributeGuide: vi.fn(),
    methodGuide: vi.fn(),
  }),
}))

describe('projectPlanning business input', () => {
  it('resolves run input from project and navigation planning inputs', () => {
    const project = new ProjectModel({
      projectId: 'demo',
      project: {
        description: '订单与库存管理',
        planningAttachmentRef: 'attachments/project.md',
      },
    })
    project.replaceNavigationRoot({
      id: 'homepage_root',
      title: 'Demo',
      nodeKind: 'module',
      childPlacement: 'header',
      children: [
        {
          id: 'orders',
          title: '订单',
          nodeKind: 'page',
          path: '/orders',
          description: '订单页',
          planningAttachmentRef: 'attachments/orders.md',
        },
      ],
    })

    expect(resolveProjectPlanningRunInput(project, {
      planningAttachmentText: '项目附件正文',
      navigationAttachmentTextByNodeId: {
        orders: '订单附件正文',
      },
    })).toEqual({
      projectId: 'demo',
      requirement: '订单与库存管理',
      planningAttachmentRef: 'attachments/project.md',
      planningAttachmentText: '项目附件正文',
      navigationNodes: [
        {
          nodeId: 'homepage_root',
          title: 'Demo',
          nodeKind: 'module',
          requirement: '',
        },
        {
          nodeId: 'orders',
          title: '订单',
          nodeKind: 'page',
          requirement: '订单页',
          planningAttachmentRef: 'attachments/orders.md',
          planningAttachmentText: '订单附件正文',
        },
      ],
    })
  })

  it('resolves single navigation node planning input', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    project.replaceNavigationRoot({
      id: 'homepage_root',
      title: 'Demo',
      nodeKind: 'module',
      childPlacement: 'header',
      children: [
        {
          id: 'orders',
          title: '订单',
          nodeKind: 'page',
          path: '/orders',
          description: '订单页',
          planningAttachmentRef: 'attachments/orders.md',
        },
      ],
    })

    expect(resolveNavigationPlanningRunInput(project, 'orders', {
      planningAttachmentText: '订单附件正文',
    })).toEqual({
      nodeId: 'orders',
      title: '订单',
      nodeKind: 'page',
      requirement: '订单页',
      planningAttachmentRef: 'attachments/orders.md',
      planningAttachmentText: '订单附件正文',
    })
  })

  it('formats prompt context for LLM planning turn', () => {
    const text = formatProjectPlanningPromptContext({
      projectId: 'demo',
      requirement: '短需求',
      planningAttachmentText: '项目附件正文',
      navigationNodes: [
        {
          nodeId: 'orders',
          title: '订单',
          nodeKind: 'page',
          requirement: '订单页',
          planningAttachmentRef: 'attachments/orders.md',
        },
      ],
    })

    expect(text).toContain('projectRequirement:')
    expect(text).toContain('navigationNodes:')
    expect(text).toContain('attachments/orders.md')
    expect(text).toContain('不涉及四文件')
  })

  it('fails when project requirement is empty', () => {
    const project = new ProjectModel({ projectId: 'demo' })
    expect(() => resolveProjectPlanningRunInput(project)).toThrow(/requirement is empty/u)
  })

  it('filters empty navigation nodes in scoped resolve', () => {
    const project = new ProjectModel({
      projectId: 'demo',
      project: { description: '短需求' },
    })
    project.replaceNavigationRoot({
      id: 'homepage_root',
      title: 'Demo',
      nodeKind: 'module',
      childPlacement: 'header',
      children: [
        {
          id: 'orders',
          title: '订单',
          nodeKind: 'page',
          path: '/orders',
          description: '订单页',
        },
      ],
    })

    expect(resolveScopedProjectPlanningRunInput(project).navigationNodes).toEqual([
      {
        nodeId: 'orders',
        title: '订单',
        nodeKind: 'page',
        requirement: '订单页',
      },
    ])
  })

  it('filters navigation nodes by scopeNodeIds', () => {
    const nodes = filterNavigationPlanningRunNodes([
      { nodeId: 'a', title: 'A', nodeKind: 'page', requirement: 'a' },
      { nodeId: 'b', title: 'B', nodeKind: 'page', requirement: 'b' },
    ], { scopeNodeIds: ['b'] })

    expect(nodes).toEqual([
      { nodeId: 'b', title: 'B', nodeKind: 'page', requirement: 'b' },
    ])
  })

  it('rejects pageDesign script markers in projectPlanning gate', () => {
    const gate = evaluateProjectPlanningToolGate({
      toolName: 'vcm_script',
      args: { script: 'await this.openPageDesign({ pageId: "x" })' },
    })
    expect(gate.ok).toBe(false)
    expect(gate.reason).toMatch(/openPageDesign/u)
  })

  it('registers projectPlanning business on host', () => {
    const host = createAiAgentHost({
      turnCallbacks: {
        executeTurn: async () => ({ text: '', toolCalls: [] }),
        appendMessages: async () => {},
      },
      maxToolRounds: 4,
    })
    const project = new ProjectModel({ projectId: 'demo', project: { description: '短需求' } })
    ensureProjectPlanningBusiness({
      host,
      getProjectPlanningEditor: () => ({ project } as never),
    })

    expect(host.has(PROJECT_PLANNING_MODULE_ID)).toBe(true)
  })

  it('loads project-model VCM surface with ProjectModel root', () => {
    const projectModule = projectModelRuntimeMetadataDocument.modules.find(
      module => module.rootApi.kind === 'project',
    )
    expect(projectModule).toBeDefined()
    expect(projectModule?.rootApi.actions.length).toBeGreaterThan(0)
  })
})
