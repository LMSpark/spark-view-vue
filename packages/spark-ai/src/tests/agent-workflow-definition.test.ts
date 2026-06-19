import { describe, expect, it } from 'vitest'

import {
  AiAgentRegistration,
  AiAgentToolResult,
  createAiAgentHost,
  createSimpleInputContract,
  DefaultAiAgentSessionStore,
  dryRunAgentWorkflowDefinition,
  validateAgentWorkflowDefinition,
  type AgentWorkflowDefinition,
  type AgentWorkflowToolDescriptor,
  type AiAgentToolRuntime,
  type AiAgentTurnCallbacks,
} from '../agent'

describe('AgentWorkflowDefinition', () => {
  it('validates the workflow graph definition shape', () => {
    const validation = validateAgentWorkflowDefinition(createDefinition(), {
      resolveToolDescriptor: () => createToolDescriptor(),
    })

    expect(validation).toEqual({
      status: 'valid',
      issues: [],
    })
  })

  it('rejects legacy factory definitions', () => {
    const broken = {
      ...createDefinition(),
      factory: {},
    }

    const validation = validateAgentWorkflowDefinition(broken)

    expect(validation.status).toBe('invalid')
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_FORBIDDEN_FIELD',
        path: 'definition.factory',
      }),
    ]))
  })

  it('validates ClassModel tool parameters through a descriptor resolver', () => {
    const broken = JSON.parse(JSON.stringify(createDefinition())) as AgentWorkflowDefinition
    const tool = broken.workflow.graph.nodes.find(node => node.id === 'tool.demo')
    if (tool?.type !== 'tool') throw new Error('test fixture must include tool.demo')
    ;(tool.data.toolParameters as Record<string, unknown>)['prompt'] = undefined
    delete (tool.data.toolParameters as Record<string, unknown>)['prompt']

    const validation = validateAgentWorkflowDefinition(broken, {
      resolveToolDescriptor: () => createToolDescriptor(),
    })

    expect(validation.status).toBe('invalid')
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_TOOL_PARAMETER_MISSING',
        nodeId: 'tool.demo',
        path: 'definition.workflow.graph.nodes[1].data.toolParameters.prompt',
      }),
    ]))
  })

  it('validates chatflow references through a definition loader', () => {
    const definition = createDefinition({
      nodes: [
        createStartNode(),
        {
          id: 'chatflow.clarify',
          type: 'chatflow',
          data: {
            title: 'Clarify',
            workflowRef: {
              workflowId: 'demo.clarify',
              version: 1,
              definitionPath: 'workflows/demo.clarify/definition.json',
            },
            inputMapping: {
              context: '{{ start.prompt }}',
            },
            outputMapping: {
              answers: 'clarify.answers',
            },
          },
        },
        createEndNode(),
      ],
      edges: [
        { id: 'edge.start.chatflow', source: 'start', target: 'chatflow.clarify' },
        { id: 'edge.chatflow.end', source: 'chatflow.clarify', target: 'end' },
      ],
    })

    const validation = validateAgentWorkflowDefinition(definition, {
      loadWorkflowDefinition: ref => ref.workflowId === 'demo.clarify'
        ? createDefinition({ workflowId: 'demo.clarify' })
        : undefined,
    })

    expect(validation).toEqual({
      status: 'valid',
      issues: [],
    })
  })

  it('uses workflowId binding to ensure the runtime carrier and run host dryRun', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() })
    let createCalls = 0

    const result = dryRunAgentWorkflowDefinition({
      host,
      definition: createDefinition(),
      bindings: {
        workflows: {
          'demo.workflow': {
            alias: 'demo',
            moduleId: 'demo.module',
            rootClassName: 'DemoBusiness',
            create: () => {
              createCalls += 1
              return createRegistration('demo.module')
            },
          },
        },
      },
      input: {
        id: 'demo-1',
        prompt: 'Build demo',
      },
    })

    expect(createCalls).toBe(1)
    expect(result.activation).toMatchObject({
      workflowId: 'demo.workflow',
      alias: 'demo',
      moduleId: 'demo.module',
      rootClassName: 'DemoBusiness',
    })
    expect(result.host.has('demo')).toBe(true)
    expect(result.dryRun.ok).toBe(true)
    if (result.dryRun.ok) {
      expect(result.dryRun.normalizedInput).toMatchObject({
        id: 'demo-1',
        prompt: 'Build demo',
      })
    }
  })

  it('fails fast when workflow runtime binding is missing', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() })

    expect(() => dryRunAgentWorkflowDefinition({
      host,
      definition: createDefinition(),
      bindings: { workflows: {} },
      input: { id: 'demo-1', prompt: 'Build demo' },
    })).toThrow('runtime binding not found: demo.workflow')
  })
})

function createDefinition(options: {
  workflowId?: string
  nodes?: AgentWorkflowDefinition['workflow']['graph']['nodes']
  edges?: AgentWorkflowDefinition['workflow']['graph']['edges']
} = {}): AgentWorkflowDefinition {
  const workflowId = options.workflowId ?? 'demo.workflow'
  const now = '2026-06-16T00:00:00.000Z'
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId,
    source: {
      designKind: 'agent.workflow.design',
      designId: workflowId,
      designVersion: 1,
    },
    workflow: {
      variables: [
        { name: 'id', required: true },
        { name: 'prompt', required: true },
      ],
      graph: {
        nodes: options.nodes ?? [
          createStartNode(),
          {
            id: 'tool.demo',
            type: 'tool',
            data: {
              title: 'Demo Tool',
              provider: 'class-model',
              toolName: 'spark.demo.run',
              toolParameters: {
                id: '{{ start.id }}',
                prompt: '{{ start.prompt }}',
              },
            },
          },
          createEndNode(),
        ],
        edges: options.edges ?? [
          { id: 'edge.start.tool', source: 'start', target: 'tool.demo' },
          { id: 'edge.tool.end', source: 'tool.demo', target: 'end' },
        ],
      },
    },
    x_spark: {
      schema: 'spark.agent.workflow.definition.v1',
      publishedAt: now,
      validation: {
        status: 'valid',
        issues: [],
      },
    },
  }
}

function createStartNode(): AgentWorkflowDefinition['workflow']['graph']['nodes'][number] {
  return {
    id: 'start',
    type: 'start',
    data: {
      title: 'Start',
    },
  }
}

function createEndNode(): AgentWorkflowDefinition['workflow']['graph']['nodes'][number] {
  return {
    id: 'end',
    type: 'end',
    data: {
      title: 'End',
    },
  }
}

function createToolDescriptor(): AgentWorkflowToolDescriptor {
  return {
    provider: 'class-model',
    toolName: 'spark.demo.run',
    parameters: [
      { name: 'id', required: true, source: 'constructor' },
      { name: 'prompt', required: true, source: 'function' },
    ],
  }
}

function createRegistration(moduleId: string, runtime = createRuntime()): AiAgentRegistration {
  return new AiAgentRegistration({
    moduleId,
    name: 'Demo module',
    description: 'Demo module business.',
    runtime,
    inputContract: createSimpleInputContract({
      businessId: moduleId,
      identityField: 'id',
      messageField: 'prompt',
      paramsSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          prompt: { type: 'string' },
        },
        required: ['id', 'prompt'],
        additionalProperties: false,
      },
      systemPrompt: 'Demo system prompt.',
    }),
    sessionStore: new DefaultAiAgentSessionStore(),
  })
}

function createRuntime(): AiAgentToolRuntime {
  return {
    getTools: () => [],
    executeTool: async () => AiAgentToolResult.ok({}),
    projectKnowledge: () => ({ promptSnapshot: 'DemoBusiness runtime.' }),
    inspect: () => ({
      status: 'ok',
      rootKinds: ['DemoBusiness'],
      moduleCount: 1,
      findings: [],
    }),
  }
}

function createTurnCallbacks(): AiAgentTurnCallbacks {
  return {
    executeTurn: async () => ({
      text: '',
      toolCalls: [],
    }),
    appendMessages: async () => {},
  }
}
