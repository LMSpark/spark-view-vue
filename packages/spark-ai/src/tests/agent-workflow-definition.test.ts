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
  type AgentWorkflowFactorySection,
  type AiAgentToolRuntime,
  type AiAgentTurnCallbacks,
  type BusinessFactoryWorkflowPhaseId,
  type BusinessFactoryWorkflowPhaseKind,
} from '../agent'

describe('AgentWorkflowDefinition', () => {
  it('validates the F0-F9 business factory definition shape', () => {
    const validation = validateAgentWorkflowDefinition(createDefinition())

    expect(validation).toEqual({
      status: 'valid',
      issues: [],
    })
  })

  it('rejects definitions that miss a required factory phase', () => {
    const broken = JSON.parse(JSON.stringify(createDefinition())) as Record<string, unknown>
    const factory = broken['factory'] as Record<string, unknown>
    delete factory['activation']

    const validation = validateAgentWorkflowDefinition(broken)

    expect(validation.status).toBe('invalid')
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'AGENT_WORKFLOW_REQUIRED_OBJECT_MISSING',
        path: 'definition.factory.activation',
      }),
    ]))
  })

  it('uses activation binding to ensure the registration and run host dryRun', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() })
    let createCalls = 0

    const result = dryRunAgentWorkflowDefinition({
      host,
      definition: createDefinition(),
      bindings: {
        registrations: {
          'demo.registration': {
            moduleId: 'demo.module',
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
      alias: 'demo',
      moduleId: 'demo.module',
      registrationBindingKey: 'demo.registration',
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

  it('fails fast when activation binding is missing or targets another module', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() })

    expect(() => dryRunAgentWorkflowDefinition({
      host,
      definition: createDefinition(),
      bindings: { registrations: {} },
      input: { id: 'demo-1', prompt: 'Build demo' },
    })).toThrow('registration binding not found: demo.registration')

    expect(() => dryRunAgentWorkflowDefinition({
      host,
      definition: createDefinition(),
      bindings: {
        registrations: {
          'demo.registration': {
            moduleId: 'other.module',
            create: () => createRegistration('other.module'),
          },
        },
      },
      input: { id: 'demo-1', prompt: 'Build demo' },
    })).toThrow('binding moduleId mismatch')
  })
})

function createDefinition(): AgentWorkflowDefinition {
  const now = '2026-06-16T00:00:00.000Z'
  return {
    kind: 'agent.workflow',
    version: 1,
    workflowId: 'demo.workflow',
    source: {
      designKind: 'agent.workflow.design',
      designId: 'demo.workflow',
      designVersion: 1,
    },
    factory: {
      identity: section('F0', 'identity', 'factory.identity', 'workflow.factory.identity', {
        alias: 'demo',
        moduleId: 'demo.module',
        rootClassName: 'DemoBusiness',
      }),
      materials: section('F1', 'materials', 'factory.materials', 'workflow.factory.materials'),
      knowledge: section('F2', 'knowledge', 'factory.knowledge', 'workflow.factory.knowledge'),
      contract: section('F3', 'contract', 'factory.contract', 'workflow.factory.contract'),
      runtime: section('F4', 'runtime', 'factory.runtime', 'workflow.factory.runtime'),
      governance: section('F5', 'governance', 'factory.governance', 'workflow.factory.governance'),
      acceptance: section('F6', 'acceptance', 'factory.acceptance', 'workflow.factory.acceptance'),
      activation: section('F7', 'activation', 'factory.activation', 'workflow.factory.activation', {
        registrationBindingKey: 'demo.registration',
      }),
      workOrder: section('F8', 'workOrder', 'factory.workOrder', 'workflow.factory.workOrder'),
      delivery: section('F9', 'delivery', 'factory.delivery', 'workflow.factory.delivery'),
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

function section<
  TPhaseId extends BusinessFactoryWorkflowPhaseId,
  TPhaseKind extends BusinessFactoryWorkflowPhaseKind,
>(
  phaseId: TPhaseId,
  phase: TPhaseKind,
  sectionPath: string,
  publishPath: string,
  value: Readonly<Record<string, unknown>> = {},
): AgentWorkflowFactorySection<TPhaseId, TPhaseKind> {
  return {
    phaseId,
    phase,
    sectionPath,
    publishPath,
    nodeId: `phase.${phaseId}`,
    scopePath: `workflow.graph.loop.business-factory.loop.subGraph:phase.${phaseId}`,
    value,
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
