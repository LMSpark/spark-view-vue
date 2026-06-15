import { describe, expect, it } from 'vitest'

import {
  addWorkflowDesignEdge,
  collectWorkflowDesignEdges,
  collectWorkflowDesignGraphs,
  collectWorkflowDesignNodes,
  createWorkflowDesignNode,
  getSingleModelEditValue,
  markWorkflowDesignDirty,
  removeWorkflowDesignEdge,
  removeWorkflowDesignNode,
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
})
