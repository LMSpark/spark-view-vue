import { describe, expect, it } from 'vitest'

import {
  activateAgentWorkflowFromDefinition,
  AiAgentRegistration,
  AiAgentToolResult,
  createAiAgentHost,
  createSimpleInputContract,
  DefaultAiAgentSessionStore,
  dryRunAgentWorkflowDefinition,
  interpretAgentWorkflowDefinition,
  validateAgentWorkflowDefinition,
  type AgentWorkflowDefinition,
  type AgentWorkflowRuntimeBindings,
  type AiAgentToolRuntime,
  type AiAgentTurnCallbacks,
} from '../agent'
import type { ClassModelKnowledgeProvider } from '../class-model'

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

  it('rejects legacy tool parameter fields on business nodes', () => {
    const broken = JSON.parse(JSON.stringify(createDefinition())) as AgentWorkflowDefinition
    const node = broken.workflow.graph.nodes.find(item => item.id === 'node.demo')
    if (node?.type !== 'node') throw new Error('test fixture must include node.demo')
    ;(node.data as Record<string, unknown>)['toolParameters'] = {
      prompt: '{{ start.prompt }}',
    }

    const validation = validateAgentWorkflowDefinition(broken)

    expect(validation.status).toBe('invalid')
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_LEGACY_NODE_FIELD',
        nodeId: 'node.demo',
        path: 'definition.workflow.graph.nodes[1].data.toolParameters',
      }),
    ]))
  })

  it('rejects business nodes without runtimeBinding', () => {
    const broken = JSON.parse(JSON.stringify(createDefinition())) as AgentWorkflowDefinition
    const node = broken.workflow.graph.nodes.find(item => item.id === 'node.demo')
    if (node?.type !== 'node') throw new Error('test fixture must include node.demo')
    delete (node.data as Record<string, unknown>)['runtimeBinding']

    const validation = validateAgentWorkflowDefinition(broken)

    expect(validation.status).toBe('invalid')
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_REQUIRED_OBJECT_MISSING',
        path: 'definition.workflow.graph.nodes[1].data.runtimeBinding',
      }),
    ]))
  })

  it('rejects old structural chatflow nodes', () => {
    const definition = JSON.parse(JSON.stringify(createDefinition())) as Record<string, unknown>
    const workflow = definition['workflow'] as Record<string, unknown>
    const graph = workflow['graph'] as Record<string, unknown>
    graph['nodes'] = [
      createStartNode(),
      {
        id: 'chatflow.clarify',
        type: 'chatflow',
        data: {
          title: 'Clarify',
          workflowRef: {
            workflowId: 'demo.clarify',
          },
          inputs: {},
          outputs: {},
        },
      },
      createOutputNode(),
    ]
    graph['edges'] = [
      { id: 'edge.start.chatflow', source: 'start', target: 'chatflow.clarify' },
      { id: 'edge.chatflow.output', source: 'chatflow.clarify', target: 'output' },
    ]

    const validation = validateAgentWorkflowDefinition(definition)

    expect(validation.status).toBe('invalid')
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_UNKNOWN_NODE_TYPE',
        nodeId: 'chatflow.clarify',
        path: 'definition.workflow.graph.nodes[1].type',
      }),
    ]))
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

  it('interprets runtimeBinding with app bindings and activates the host', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() })
    const definition = createDefinition()
    const bindings = createRuntimeBindings()

    const interpreted = interpretAgentWorkflowDefinition({
      definition,
      bindings,
    })
    const activated = activateAgentWorkflowFromDefinition({
      host,
      definition,
      bindings,
    })

    expect(interpreted).toMatchObject({
      workflowId: 'demo.workflow',
      alias: 'demo',
      moduleId: 'demo.module',
      rootClassName: 'DemoBusiness',
    })
    expect(activated.has('demo')).toBe(true)
    const dryRun = activated.dryRun('demo', {
      id: 'demo-1',
      prompt: 'Build demo',
    })
    expect(dryRun.ok).toBe(true)
    if (dryRun.ok) {
      expect(dryRun.moduleId).toBe('demo.module')
      expect(dryRun.orchestration.systemPrompt).toContain('Demo system prompt')
      expect(dryRun.orchestration.readonlySteps).toEqual(['Read demo context.'])
    }
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
          createBusinessNode(),
          createOutputNode(),
        ],
        edges: options.edges ?? [
          { id: 'edge.start.node', source: 'start', target: 'node.demo' },
          { id: 'edge.node.output', source: 'node.demo', target: 'output' },
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

function createBusinessNode(): AgentWorkflowDefinition['workflow']['graph']['nodes'][number] {
  return {
    id: 'node.demo',
    type: 'node',
    data: {
      title: 'Demo Node',
      model: {
        rootClassName: 'DemoBusiness',
        className: 'DemoBusiness',
        contextPath: '$',
      },
      inputs: {
        id: '{{ start.id }}',
        prompt: '{{ start.prompt }}',
      },
      outputs: {
        result: 'demo.result',
      },
      llm: {
        task: {
          goal: 'Plan and execute the requested demo work.',
          requirements: {
            prompt: '{{ start.prompt }}',
          },
          contextInputs: {
            id: '{{ start.id }}',
          },
        },
        knowledge: {
          rootClassName: 'DemoBusiness',
          className: 'DemoBusiness',
          allowedActions: ['runDemo', 'validateDemo'],
          readableAttributes: ['result'],
        },
        functionCalling: {
          mode: 'freeWithinModelContext',
          constraints: [],
        },
        output: {
          structuredResult: {
            result: 'demo.result',
          },
          handoffToValidation: true,
        },
      },
      validation: {
        action: {
          className: 'DemoBusiness',
          actionName: 'validateDemo',
          inputProjection: {
            result: 'demo.result',
          },
          expectedResult: {
            ok: true,
          },
        },
        status: 'draft',
        issues: [],
      },
      runtimeBinding: {
        registration: {
          alias: 'demo',
          moduleId: 'demo.module',
          businessId: 'demo.module',
        },
        inputContract: {
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
          readonlySteps: ['Read demo context.'],
        },
        systemPrompt: {
          template: 'Demo system prompt.',
          conditionalHints: [
            {
              when: {
                promptIncludes: 'demo',
              },
              template: 'Prefer the demo path.',
            },
          ],
        },
        knowledge: {
          rootClassName: 'DemoBusiness',
          manifestUrlRef: 'dts-class-model',
        },
        toolLoopNudge: {
          templates: {
            plan_without_tool: 'demo id="{{moduleInstanceId}}" must call a tool.',
          },
          contextFields: ['moduleInstanceId'],
        },
        beforeFunctionCall: {
          gateRules: [
            {
              kind: 'demoAllow',
            },
          ],
        },
        executionToolNames: ['model_script'],
        planWithoutToolMarkers: ['rundemo'],
        agentCompleteMethodName: 'completeDemo',
        resolveInstance: {
          editorSource: 'demo',
          identityField: 'id',
        },
        moduleClassRef: {
          kind: 'DemoBusiness',
        },
      },
      capabilities: [
        {
          id: 'demo.execute',
          title: 'Execute Demo',
          scope: 'node',
          description: 'Let the demo node plan and execute the requested work.',
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
        result: '{{ node.demo.result }}',
      },
    },
  }
}

class DemoBusiness {}

function createRuntimeBindings(): AgentWorkflowRuntimeBindings<DemoBusiness> {
  const instance = new DemoBusiness()
  return {
    moduleClassResolver: (ref) => {
      if (ref.kind !== 'DemoBusiness') {
        throw new Error(`Unexpected module class ref: ${ref.kind}`)
      }
      return DemoBusiness
    },
    editorGetterRegistry: {
      demo: () => instance,
    },
    knowledgeProviderFactory: (config) => ({
      provider: createKnowledgeProvider(config.rootClassName),
      dtsClassModelManifestUrl: `/${config.manifestUrlRef}/manifest.json`,
    }),
    gateExecutor: (command) => {
      const unknownRule = command.rules.find(rule => rule.kind !== 'demoAllow')
      if (unknownRule !== undefined) {
        throw new Error(`Unknown demo gate rule: ${unknownRule.kind}`)
      }
      return { ok: true }
    },
    systemPromptInterpolator: (command) => [
      command.template,
      ...command.hints.map(hint => hint.template),
    ].join('\n'),
  }
}

function createKnowledgeProvider(rootClassName: string): ClassModelKnowledgeProvider {
  return {
    query: () => ({
      rootClassName,
      results: [],
    }),
    modelGuide: () => `${rootClassName} guide`,
    attributeGuide: input => `${input.kind}.${input.attributeName}`,
    methodGuide: input => `${input.kind}.${input.methodName}`,
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
