import { describe, expect, it } from 'vitest'
import { createAiAgentHost, type AiAgentTransportToolCall } from '@spark-appworks/spark-ai/agent'
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
import { projectPageSurfaceRuntimeMetadataDocument } from '../../generated/vcm/project-page-surface/project-page-surface-module-metadata.runtime'

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

  it('rejects action names queried as VCM attributes in projectPlanning gate', () => {
    const gate = evaluateProjectPlanningToolGate({
      toolName: 'vcm_attribute_guide',
      args: {
        kind: 'project',
        attributeName: 'replaceNavigationChildren',
      },
    })

    expect(gate.ok).toBe(false)
    expect(gate.fix).toContain('vcm_action_guide({ kind: "project", actionName: "replaceNavigationChildren" })')
  })

  it('rejects parameter type names queried as VCM attributes in projectPlanning gate', () => {
    const gate = evaluateProjectPlanningToolGate({
      toolName: 'vcm_attribute_guide',
      args: {
        kind: 'project',
        attributeName: 'ProjectNodeData',
      },
    })

    expect(gate.ok).toBe(false)
    expect(gate.fix).toContain('paramsSchema.children')
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

  it('guides App-layer projectPlanning to execute VCM actions through this-scoped script', () => {
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

    const dryRun = host.dryRun(PROJECT_PLANNING_MODULE_ID, {
      projectScopeKey: 'tenant-a:demo',
      projectId: 'demo',
      requirement: '短需求',
      navigationNodes: [],
    })

    expect(dryRun.ok).toBe(true)
    if (!dryRun.ok) {
      throw new Error(dryRun.error.message)
    }
    expect(dryRun.orchestration.systemPrompt).toContain(
      'vcm_action_guide({ kind: "project", actionName: "replaceNavigationChildren" })',
    )
    expect(dryRun.orchestration.systemPrompt).toContain('LLM 只负责发出 vcm_script({ script }) tool_call')
    expect(dryRun.orchestration.systemPrompt).toContain('运行时负责把 this 绑定到 ProjectModel 并执行脚本')
    expect(dryRun.orchestration.systemPrompt).toContain('不要把脚本写成普通文本回答')
    expect(dryRun.orchestration.systemPrompt).toContain('replaceNavigationChildren/readProjectPlanningInput/readNavigationPlanningInputs 都是 action')
    expect(dryRun.orchestration.systemPrompt).toContain('不要查询 project.ProjectNodeData')
    expect(dryRun.orchestration.systemPrompt).toContain('paramsSchema.children')
    expect(dryRun.orchestration.systemPrompt).toContain('await this.replaceNavigationChildren({ children })')
    expect(dryRun.orchestration.systemPrompt).toContain('nodeKind="page"')
    expect(dryRun.orchestration.systemPrompt).toContain('children 页面概要')
    expect(dryRun.orchestration.systemPrompt).toContain('不要访问 project.replaceNavigationChildren')
    expect(dryRun.orchestration.systemPrompt).toContain('不存在 project.projectPlanning')
  })

  it('rejects completion when navigation planning has modules but no page nodes', async () => {
    const project = new ProjectModel({ projectId: 'demo', project: { description: '短需求' } })
    const toolCalls = [
      createToolCall('vcm_script', {
        script: [
          'const children = [',
          '  { id: "hr", title: "人力资源", nodeKind: "module", path: "/hr", description: "人力资源模块" }',
          ']',
          'return await this.replaceNavigationChildren({ children })',
        ].join('\n'),
      }),
      createToolCall('agent_complete', { summary: 'done' }),
      createToolCall('vcm_script', {
        script: [
          'const children = [',
          '  {',
          '    id: "hr",',
          '    title: "人力资源",',
          '    nodeKind: "module",',
          '    path: "/hr",',
          '    description: "人力资源模块",',
          '    children: [',
          '      { id: "employee-list", title: "员工列表", nodeKind: "page", path: "/hr/employees", description: "员工档案列表与检索" }',
          '    ]',
          '  }',
          ']',
          'return await this.replaceNavigationChildren({ children })',
        ].join('\n'),
      }),
      createToolCall('agent_complete', { summary: 'done' }),
    ]
    let turnIndex = 0
    const host = createAiAgentHost({
      turnCallbacks: {
        executeTurn: async () => ({
          text: '',
          toolCalls: [toolCalls[turnIndex++] ?? createToolCall('agent_complete', { summary: 'fallback' })],
        }),
        appendMessages: async () => {},
      },
      maxToolRounds: 6,
    })

    ensureProjectPlanningBusiness({
      host,
      getProjectPlanningEditor: () => ({ project } as never),
    })

    await host.run(PROJECT_PLANNING_MODULE_ID, {
      projectScopeKey: 'tenant-a:demo:request-1',
      projectId: 'demo',
      requirement: '短需求',
      navigationNodes: [],
    })

    expect(turnIndex).toBe(4)
    expect(project.toTree().some(node => node.children?.some(child => child.nodeKind === 'page'))).toBe(true)
  })

  it('loads project-page-surface VCM surface with ProjectModel root', () => {
    const projectModule = projectPageSurfaceRuntimeMetadataDocument.modules.find(
      module => module.rootApi.kind === 'project',
    )
    expect(projectModule).toBeDefined()
    expect(projectModule?.rootApi.actions.length).toBeGreaterThan(0)
  })
})

let toolCallSeq = 0

function createToolCall(name: string, args: Record<string, unknown>): AiAgentTransportToolCall {
  toolCallSeq += 1
  return {
    id: `call-${name}-${String(toolCallSeq)}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}
