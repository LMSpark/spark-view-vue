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
  type AiAgentToolRuntime,
  type AiAgentTurnCallbacks,
} from '../agent'

describe('AgentWorkflowDefinition', () => {
  it('validates the workflow graph definition shape', () => {
    const validation = validateAgentWorkflowDefinition(createDefinition())

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

  it('rejects legacy tool parameter fields', () => {
    const broken = JSON.parse(JSON.stringify(createDefinition())) as AgentWorkflowDefinition
    const tool = broken.workflow.graph.nodes.find(node => node.id === 'tool.demo')
    if (tool?.type !== 'tool') throw new Error('test fixture must include tool.demo')
    ;(tool.data as Record<string, unknown>)['toolParameters'] = {
      prompt: '{{ start.prompt }}',
    }

    const validation = validateAgentWorkflowDefinition(broken)

    expect(validation.status).toBe('invalid')
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE_FIELD',
        nodeId: 'tool.demo',
        path: 'definition.workflow.graph.nodes[1].data.toolParameters',
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
            inputs: {
              context: '{{ start.prompt }}',
            },
            outputs: {
              answers: 'clarify.answers',
            },
          },
        },
        createOutputNode(),
      ],
      edges: [
        { id: 'edge.start.chatflow', source: 'start', target: 'chatflow.clarify' },
        { id: 'edge.chatflow.output', source: 'chatflow.clarify', target: 'output' },
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
      capabilities: [
        {
          id: 'demo.run',
          title: 'Demo Run',
          scope: 'workflow',
          description: 'Run the demo workflow.',
          constraints: [],
        },
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
              toolName: 'demoModule',
              inputs: {
                id: '{{ start.id }}',
                prompt: '{{ start.prompt }}',
              },
              outputs: {
                result: 'demo.result',
              },
              capabilities: [
                {
                  id: 'demo.execute',
                  title: 'Execute Demo',
                  scope: 'node',
                  description: 'Let the demo module plan and execute the requested work.',
                  inputs: {
                    id: '{{ start.id }}',
                    prompt: '{{ start.prompt }}',
                  },
                  outputs: {
                    result: 'demo.result',
                  },
                  constraints: [],
                },
              ],
            },
          },
          createOutputNode(),
        ],
        edges: options.edges ?? [
          { id: 'edge.start.tool', source: 'start', target: 'tool.demo' },
          { id: 'edge.tool.output', source: 'tool.demo', target: 'output' },
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

function createOutputNode(): AgentWorkflowDefinition['workflow']['graph']['nodes'][number] {
  return {
    id: 'output',
    type: 'output',
    data: {
      title: 'Output',
      outputs: {
        result: '{{ tool.demo.result }}',
      },
    },
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
