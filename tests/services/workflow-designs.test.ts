import { beforeEach, describe, expect, it, vi } from 'vitest'

const httpMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/services/http', () => ({
  http: httpMock,
}))

vi.mock('@/services/auth', () => ({
  getUser: () => ({
    tenantId: 'tenant-a',
    defaultProjectId: 'project-a',
    roles: [],
  }),
  isPlatformAdminUser: () => false,
}))

import {
  addWorkflowDesignEdge,
  collectWorkflowDesignEdges,
  collectWorkflowDesignGraphs,
  collectWorkflowDesignNodes,
  createAgentWorkflowDefinitionFromDesign,
  createWorkflowDesignNode,
  getSingleModelEditValue,
  markWorkflowDesignDirty,
  parseAgentWorkflowDefinitionJson,
  publishWorkflowDefinition,
  readWorkflowDefinition,
  removeWorkflowDesignEdge,
  removeWorkflowDesignNode,
  saveWorkflowDefinition,
  setSingleModelEditValue,
  updateWorkflowDesignEdge,
  type WorkflowDesignDocument,
} from '@/services/workflow-designs'

function createDesign(): WorkflowDesignDocument {
  return {
    kind: 'agent.workflow.design',
    version: 1,
    id: 'agent.workflow.test',
    app: {
      id: 'agent.workflow.test',
      name: 'Agent Workflow',
      mode: 'workflow',
    },
    workflow: {
      id: 'agent.workflow.test',
      version: 1,
      graph: {
        nodes: [
          {
            id: 'start',
            type: 'custom',
            data: { type: 'start', title: 'Start' },
          },
          {
            id: 'loop.business-factory',
            type: 'custom',
            data: {
              type: 'loop',
              title: 'Loop',
              loop: {
                subGraph: {
                  nodes: [
                    {
                      id: 'phase.F0',
                      type: 'custom',
                      data: {
                        type: 'tool',
                        title: 'Edit identity',
                        tool_name: 'single_model_edit',
                        provider_id: 'spark.model-editor',
                        model: {
                          phaseId: 'F0',
                          sectionPath: 'factory.identity',
                          value: { name: 'initial' },
                        },
                        x_spark: {
                          nodeRole: 'single-model-edit',
                          phaseId: 'F0',
                          sectionPath: 'factory.identity',
                          publishPath: 'workflow.factory.identity',
                        },
                      },
                    },
                    {
                      id: 'loop.exit',
                      type: 'custom',
                      data: { type: 'exit-loop', title: 'Exit Loop' },
                    },
                  ],
                  edges: [
                    {
                      id: 'edge.F0.exit',
                      source: 'phase.F0',
                      target: 'loop.exit',
                    },
                  ],
                },
              },
            },
          },
          {
            id: 'end',
            type: 'custom',
            data: { type: 'end', title: 'End' },
          },
        ],
        edges: [
          { id: 'edge.start.loop', source: 'start', target: 'loop.business-factory' },
          { id: 'edge.loop.end', source: 'loop.business-factory', target: 'end' },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.design.v1',
      draft: { status: 'draft', dirtyPaths: [] },
      validation: { status: 'unknown', issues: [] },
    },
  }
}

describe('workflow design helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('collects single_model_edit tool nodes from loop subgraphs', () => {
    const nodes = collectWorkflowDesignNodes(createDesign())
    const tool = nodes.find(node => node.id === 'phase.F0')

    expect(nodes.map(node => node.id)).toEqual([
      'start',
      'loop.business-factory',
      'phase.F0',
      'loop.exit',
      'end',
    ])
    expect(tool?.isSingleModelEditTool).toBe(true)
    expect(tool?.depth).toBe(1)
    expect(tool?.phaseId).toBe('F0')
    expect(tool?.sectionPath).toBe('factory.identity')
    expect(tool?.publishPath).toBe('workflow.factory.identity')
  })

  it('updates single model value on the tool node itself', () => {
    const design = createDesign()
    const tool = collectWorkflowDesignNodes(design).find(node => node.id === 'phase.F0')
    if (tool === undefined) throw new Error('missing test tool node')

    setSingleModelEditValue(tool.node, { name: 'updated' })
    markWorkflowDesignDirty(design, `${tool.scopePath}.${tool.id}.data.model.value`)

    expect(getSingleModelEditValue(tool.node)).toEqual({ name: 'updated' })
    expect(design.x_spark.draft?.['status']).toBe('dirty')
    expect(design.x_spark.draft?.['dirtyPaths']).toContain('workflow.graph.loop.business-factory.loop.subGraph.phase.F0.data.model.value')
  })

  it('collects graph and edge views across loop subgraphs', () => {
    const design = createDesign()
    const graphs = collectWorkflowDesignGraphs(design)
    const edges = collectWorkflowDesignEdges(design)

    expect(graphs.map(graph => graph.scopePath)).toEqual([
      'workflow.graph',
      'workflow.graph.loop.business-factory.loop.subGraph',
    ])
    expect(graphs[1]?.carrier).toBe('loop')
    expect(graphs[1]?.ownerNodeId).toBe('loop.business-factory')
    expect(edges.map(edge => edge.id)).toEqual([
      'edge.start.loop',
      'edge.loop.end',
      'edge.F0.exit',
    ])
    expect(edges.find(edge => edge.id === 'edge.F0.exit')?.scopePath).toBe('workflow.graph.loop.business-factory.loop.subGraph')
  })

  it('adds and removes edges in a selected graph', () => {
    const design = createDesign()
    const loopGraph = design.workflow.graph.nodes[1]?.data?.loop?.subGraph
    if (loopGraph === undefined) throw new Error('missing loop graph')

    const edge = addWorkflowDesignEdge(loopGraph, 'phase.F0', 'phase.F0')
    expect(edge.id).toBe('edge.phase.F0.phase.F0')
    expect(loopGraph.edges.some(item => item === edge)).toBe(true)

    expect(removeWorkflowDesignEdge(loopGraph, edge)).toBe(true)
    expect(loopGraph.edges.some(item => item === edge)).toBe(false)
  })

  it('creates typed nodes in the selected graph', () => {
    const design = createDesign()
    const loopGraph = design.workflow.graph.nodes[1]?.data?.loop?.subGraph
    if (loopGraph === undefined) throw new Error('missing loop graph')

    const tool = createWorkflowDesignNode(loopGraph, {
      nodeKind: 'tool',
      id: 'phase.F1',
      title: 'Edit audience',
      phaseId: 'F1',
      sectionPath: 'factory.audience',
    })
    const loop = createWorkflowDesignNode(design.workflow.graph, {
      nodeKind: 'loop',
      id: 'loop.review',
      title: 'Review Loop',
    })

    expect(tool.data?.tool_name).toBe('single_model_edit')
    expect(tool.data?.model?.['sectionPath']).toBe('factory.audience')
    expect(loop.data?.loop?.subGraph?.nodes[0]?.data?.type).toBe('exit-loop')
    expect(collectWorkflowDesignNodes(design).map(node => node.id)).toContain('phase.F1')
  })

  it('removes a node and all related edges in the same graph', () => {
    const design = createDesign()
    const rootGraph = design.workflow.graph

    const result = removeWorkflowDesignNode(rootGraph, 'loop.business-factory')

    expect(result.removed).toBe(true)
    expect(result.removedEdges.map(edge => edge.id)).toEqual(['edge.start.loop', 'edge.loop.end'])
    expect(rootGraph.nodes.map(node => node.id)).toEqual(['start', 'end'])
    expect(rootGraph.edges).toEqual([])
  })

  it('updates edge endpoints and metadata', () => {
    const design = createDesign()
    const edge = design.workflow.graph.edges[0]
    if (edge === undefined) throw new Error('missing edge')

    updateWorkflowDesignEdge(edge, {
      source: 'loop.business-factory',
      target: 'end',
      sourceHandle: 'next',
      targetHandle: 'entry',
      type: 'custom',
      relation: 'fallback',
    })

    expect(edge).toEqual(expect.objectContaining({
      source: 'loop.business-factory',
      target: 'end',
      sourceHandle: 'next',
      targetHandle: 'entry',
      type: 'custom',
      data: { relation: 'fallback' },
    }))
  })

  it('publishes complete F0-F9 model values into an AgentWorkflowDefinition', () => {
    const design = createCompleteBusinessFactoryDesign()

    const definition = createAgentWorkflowDefinitionFromDesign(design, {
      publishedAt: '2026-06-16T00:00:00.000Z',
    })

    expect(definition).toMatchObject({
      kind: 'agent.workflow',
      version: 1,
      workflowId: 'agent.workflow.test',
      source: {
        designKind: 'agent.workflow.design',
        designId: 'agent.workflow.test',
        designVersion: 1,
      },
      x_spark: {
        schema: 'spark.agent.workflow.definition.v1',
        publishedAt: '2026-06-16T00:00:00.000Z',
        validation: {
          status: 'valid',
          issues: [],
        },
      },
    })
    expect(definition.process?.processId).toBe('test.page-design-process')
    expect(definition.process?.sourceRef).toBe('docs/ai/DATASET_PAGE_DESIGN_AI_FLOW_100_STEPS_ZH.md#10')
    expect(definition.process?.stages).toHaveLength(7)
    expect(definition.process?.stages[0]).toMatchObject({
      stageId: 'PD1.scope-inventory',
      sourceSteps: '1-20',
      considerations: expect.arrayContaining([
        expect.objectContaining({
          phaseId: 'F0',
          metrics: expect.arrayContaining([
            expect.objectContaining({
              metricId: 'PD1.scope-inventory.F0.metric',
              operator: 'gte',
              target: 1,
            }),
          ]),
        }),
        expect.objectContaining({ phaseId: 'F9' }),
      ]),
    })
    expect(definition.factory.identity.value).toEqual({
      alias: 'pageDesign',
      moduleId: 'pageDesign',
      rootClassName: 'ProjectModel',
    })
    expect(definition.factory.activation.value).toEqual({
      status: 'deferred',
      reason: 'process-flow-shaping-only',
    })
    expect(definition.factory.delivery.value).toEqual({
      status: 'deferred',
      reason: 'process-flow-shaping-only',
    })
    expect(design.workflow.graph.nodes.map(node => node.id)).toEqual([
      'start',
      'process.PD1.scope-inventory',
      'process.PD2.data-model',
      'process.PD3.table-relations',
      'process.PD4.page-data-use',
      'process.PD5.views-dependencies',
      'process.PD6.structure-behavior-style',
      'process.PD7.verify-deliver',
      'end',
    ])
    expect(design.workflow.graph.edges.map(edge => edge.id)).toEqual([
      'edge.start.PD1',
      'edge.PD1.PD2',
      'edge.PD2.PD3',
      'edge.PD3.PD4',
      'edge.PD4.PD5',
      'edge.PD5.PD6',
      'edge.PD6.PD7',
      'edge.PD7.end',
    ])
  })

  it('keeps an invalid publishable definition when required phases are missing', () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createDesign(), {
      publishedAt: '2026-06-16T00:00:00.000Z',
    })

    expect(definition.x_spark.validation.status).toBe('invalid')
    expect(definition.x_spark.validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_FACTORY_PHASE_MISSING',
        phaseId: 'F1',
      }),
    ]))
    expect(definition.factory.materials.value).toEqual({})
  })

  it('marks duplicate publishPath as invalid', () => {
    const design = createDesign()
    const loopGraph = design.workflow.graph.nodes[1]?.data?.loop?.subGraph
    if (loopGraph === undefined) throw new Error('missing loop graph')
    createWorkflowDesignNode(loopGraph, {
      nodeKind: 'tool',
      id: 'phase.F0.duplicate',
      title: 'Duplicate identity',
      phaseId: 'F0',
      sectionPath: 'factory.identity',
    })

    const definition = createAgentWorkflowDefinitionFromDesign(design)

    expect(definition.x_spark.validation.status).toBe('invalid')
    expect(definition.x_spark.validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_DUPLICATE_PUBLISH_PATH',
        phaseId: 'F0',
      }),
    ]))
  })

  it('posts a generated definition to the publish endpoint', async () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createCompleteBusinessFactoryDesign())
    httpMock.post.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '1',
    })

    const result = await publishWorkflowDefinition('agent.workflow.test', definition)

    expect(result.filename).toBe('definition.json')
    expect(httpMock.post).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/__publish',
      definition,
    )
  })

  it('reads and saves definition.json through the document endpoint', async () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createCompleteBusinessFactoryDesign())
    httpMock.get.mockResolvedValue({
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '2',
      definition,
    })
    httpMock.put.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '3',
    })

    const readResult = await readWorkflowDefinition('agent.workflow.test', '1')
    const saveResult = await saveWorkflowDefinition('agent.workflow.test', definition)

    expect(readResult.definition).toBe(definition)
    expect(saveResult.timestamp).toBe('3')
    expect(httpMock.get).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/definition.json',
      { timestamp: '1' },
    )
    expect(httpMock.put).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/definition.json',
      definition,
    )
  })

  it('falls back to publish when the definition document endpoint is missing', async () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createCompleteBusinessFactoryDesign())
    httpMock.put.mockRejectedValue(new Error(
      'No static resource api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/definition.json.',
    ))
    httpMock.post.mockResolvedValue({
      ok: true,
      workflowId: 'agent.workflow.test',
      filename: 'definition.json',
      timestamp: '4',
    })

    const result = await saveWorkflowDefinition('agent.workflow.test', definition)

    expect(result.timestamp).toBe('4')
    expect(httpMock.post).toHaveBeenCalledWith(
      '/api/tenants/tenant-a/projects/project-a/workflow-designs/agent.workflow.test/__publish',
      definition,
    )
  })

  it('parses definition JSON with AgentWorkflowDefinition validation', () => {
    const definition = createAgentWorkflowDefinitionFromDesign(createCompleteBusinessFactoryDesign())

    expect(parseAgentWorkflowDefinitionJson(JSON.stringify(definition))).toEqual(definition)
    expect(() => parseAgentWorkflowDefinitionJson('{"kind":"agent.workflow"}')).toThrow()
  })
})

function createCompleteBusinessFactoryDesign(): WorkflowDesignDocument {
  const design = createDesign()
  design.x_spark['process'] = createTestProcess()
  design.x_spark['factory'] = createTestFactory()
  design.workflow.graph = {
    id: 'agent.workflow.test.page-design-process',
    nodes: [
      createFactoryProcessStartNode(),
      ...createTestProcessStageNodes(),
      createFactoryProcessEndNode(),
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
  design.workflow.graph.edges = createFactoryProcessEdges()
  return design
}

function createFactoryProcessStartNode() {
  return {
    id: 'start',
    type: 'custom',
    position: { x: -260, y: 0 },
    data: {
      type: 'start',
      title: 'Start',
      desc: 'Factory process entry',
    },
  }
}

function createFactoryProcessEndNode() {
  return {
    id: 'end',
    type: 'custom',
    position: { x: -260, y: 240 },
    data: {
      type: 'end',
      title: 'End',
      desc: 'Factory process completion',
    },
  }
}

function createTestProcessStageNodes() {
  return createTestProcess().stages.map((stage, index) => ({
    id: `process.${stage.stageId}`,
    type: 'custom',
    position: index < 4
      ? { x: index * 300, y: 0 }
      : { x: (7 - index) * 300, y: 240 },
    data: {
      type: 'process-step',
      title: stage.title,
      desc: stage.goal,
      x_spark: {
        nodeRole: 'process-stage',
        stageId: stage.stageId,
        sourceSteps: stage.sourceSteps,
        factoryConsiderations: stage.considerations.map(item => item.phaseId),
      },
    },
  }))
}

function createFactoryProcessEdges() {
  const sequence = [
    ['edge.start.PD1', 'start', 'process.PD1.scope-inventory'],
    ['edge.PD1.PD2', 'process.PD1.scope-inventory', 'process.PD2.data-model'],
    ['edge.PD2.PD3', 'process.PD2.data-model', 'process.PD3.table-relations'],
    ['edge.PD3.PD4', 'process.PD3.table-relations', 'process.PD4.page-data-use'],
    ['edge.PD4.PD5', 'process.PD4.page-data-use', 'process.PD5.views-dependencies'],
    ['edge.PD5.PD6', 'process.PD5.views-dependencies', 'process.PD6.structure-behavior-style'],
    ['edge.PD6.PD7', 'process.PD6.structure-behavior-style', 'process.PD7.verify-deliver'],
    ['edge.PD7.end', 'process.PD7.verify-deliver', 'end'],
  ] as const

  return sequence.map(([id, source, target]) => ({
    id,
    source,
    target,
    sourceHandle: 'source',
    targetHandle: 'target',
    type: 'custom',
    data: {
      relation: 'sequence',
      meaning: 'craft-order',
    },
  }))
}

function createTestFactory() {
  return {
    identity: createTestFactorySection('F0', 'identity', 'factory.identity', 'workflow.factory.identity', {
      alias: 'pageDesign',
      moduleId: 'pageDesign',
      rootClassName: 'ProjectModel',
    }),
    materials: createTestFactorySection('F1', 'materials', 'factory.materials', 'workflow.factory.materials', {
      moduleClass: 'ProjectModel',
    }),
    knowledge: createTestFactorySection('F2', 'knowledge', 'factory.knowledge', 'workflow.factory.knowledge', {
      rootClassName: 'ProjectModel',
    }),
    contract: createTestFactorySection('F3', 'contract', 'factory.contract', 'workflow.factory.contract', {
      identityField: 'pageId',
    }),
    runtime: createTestFactorySection('F4', 'runtime', 'factory.runtime', 'workflow.factory.runtime', {
      status: 'deferred',
      reason: 'process-flow-shaping-only',
    }),
    governance: createTestFactorySection('F5', 'governance', 'factory.governance', 'workflow.factory.governance', {
      mutationGate: 'pageDesign',
    }),
    acceptance: createTestFactorySection('F6', 'acceptance', 'factory.acceptance', 'workflow.factory.acceptance', {
      dryRun: true,
    }),
    activation: createTestFactorySection('F7', 'activation', 'factory.activation', 'workflow.factory.activation', {
      status: 'deferred',
      reason: 'process-flow-shaping-only',
    }),
    workOrder: createTestFactorySection('F8', 'workOrder', 'factory.workOrder', 'workflow.factory.workOrder', {
      sampleInput: 'pageDesign',
    }),
    delivery: createTestFactorySection('F9', 'delivery', 'factory.delivery', 'workflow.factory.delivery', {
      status: 'deferred',
      reason: 'process-flow-shaping-only',
    }),
  }
}

function createTestFactorySection(
  phaseId: string,
  phase: string,
  sectionPath: string,
  publishPath: string,
  value: Readonly<Record<string, unknown>>,
) {
  return {
    phaseId,
    phase,
    sectionPath,
    publishPath,
    value,
  }
}

function createTestProcess() {
  return {
    processId: 'test.page-design-process',
    title: '页面设计测试工艺',
    sourceRef: 'docs/ai/DATASET_PAGE_DESIGN_AI_FLOW_100_STEPS_ZH.md#10',
    principle: 'workflow graph contains craft steps; F0-F9 are stage considerations.',
    stages: [
      createTestProcessStage('PD1.scope-inventory', '接单与盘点', '1-20'),
      createTestProcessStage('PD2.data-model', '数据规划与最小表模型', '21-40'),
      createTestProcessStage('PD3.table-relations', '表关系建模', '41-50'),
      createTestProcessStage('PD4.page-data-use', '页面规划与数据消费', '51-70'),
      createTestProcessStage('PD5.views-dependencies', '按需视图与依赖', '71-88'),
      createTestProcessStage('PD6.structure-behavior-style', '结构行为样式落地', '89-96'),
      createTestProcessStage('PD7.verify-deliver', '交叉校验与收尾', '97-100'),
    ],
  }
}

function createTestProcessStage(stageId: string, title: string, sourceSteps: string) {
  return {
    stageId,
    title,
    sourceSteps,
    goal: `Run source steps ${sourceSteps}.`,
    considerations: [
      {
        phaseId: 'F0',
        title: '身份边界',
        checks: ['scope'],
        metrics: [
          {
            metricId: `${stageId}.F0.metric`,
            title: 'F0 metric',
            operator: 'gte',
            target: 1,
            unit: 'item',
          },
        ],
      },
      {
        phaseId: 'F9',
        title: '交付',
        checks: ['delivery'],
        metrics: [
          {
            metricId: `${stageId}.F9.metric`,
            title: 'F9 metric',
            operator: 'eq',
            target: 0,
            unit: 'issue',
          },
        ],
      },
    ],
    steps: [
      {
        stepId: `${stageId}.1`,
        title,
        sourceSteps,
        actions: ['run stage'],
        outputs: ['stage result'],
        checks: ['stage closed'],
      },
    ],
  }
}
