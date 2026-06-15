import { describe, expect, it } from 'vitest'

import {
  AiAgentRegistration,
  AiAgentToolResult,
  createAiAgentHost,
  createSimpleInputContract,
  DefaultAiAgentSessionStore,
  type BusinessFactoryCheck,
  type BusinessFactoryWorkflowPhaseKind,
  type AiAgentToolRuntime,
  type AiAgentTurnCallbacks,
} from '../agent'

describe('AiAgentHost business factory', () => {
  it('calls ensure factory only for first registration and keeps repeated ensure idempotent', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() })
    let createCalls = 0

    const ensured = host.ensure('demo', {
      moduleId: 'demo.module',
      create: () => {
        createCalls += 1
        return createRegistration('demo.module')
      },
    })

    expect(createCalls).toBe(1)
    expect(ensured.has('demo')).toBe(true)
    expect(ensured.listRegistrations()).toMatchObject([{
      alias: 'demo',
      moduleId: 'demo.module',
      name: 'Demo module',
      description: 'Demo module business.',
      rootKinds: ['DemoBusiness'],
      moduleCount: 1,
      status: 'ok',
    }])

    const repeated = ensured.ensure('demo', {
      moduleId: 'demo.module',
      create: () => {
        createCalls += 1
        throw new Error('factory must not be called for idempotent ensure')
      },
    })

    expect(createCalls).toBe(1)
    expect(repeated.has('demo')).toBe(true)
    expect(repeated.listRegistrations()).toHaveLength(1)
  })

  it('rejects conflicting aliases/module ids without hiding factory mismatches', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() }).ensure('demo', {
      moduleId: 'demo.module',
      create: () => createRegistration('demo.module'),
    })
    let conflictFactoryCalls = 0

    expect(() => host.ensure('demo', {
      moduleId: 'other.module',
      create: () => {
        conflictFactoryCalls += 1
        return createRegistration('other.module')
      },
    })).toThrow('already bound to moduleId "demo.module"')
    expect(conflictFactoryCalls).toBe(0)

    expect(() => host.ensure('other', {
      moduleId: 'demo.module',
      create: () => {
        conflictFactoryCalls += 1
        return createRegistration('demo.module')
      },
    })).toThrow('already bound to alias "demo"')
    expect(conflictFactoryCalls).toBe(0)

    expect(() => createAiAgentHost({ turnCallbacks: createTurnCallbacks() }).ensure('bad', {
      moduleId: 'expected.module',
      create: () => {
        conflictFactoryCalls += 1
        return createRegistration('actual.module')
      },
    })).toThrow('AI agent ensure moduleId mismatch')
    expect(conflictFactoryCalls).toBe(1)
  })

  it('projects dryRun into a business factory report and workflow graph', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() }).ensure('demo', {
      moduleId: 'demo.module',
      create: () => createRegistration('demo.module'),
    })

    const result = host.inspectFactory('demo', {
      id: 'demo-1',
      prompt: 'Build demo',
    })

    expect(result.dryRun.ok).toBe(true)
    expect(result.report).toMatchObject({
      alias: 'demo',
      moduleId: 'demo.module',
      rootClassName: 'DemoBusiness',
      status: 'warn',
    })
    expect(result.report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'contract',
        status: 'pass',
        code: 'BUSINESS_FACTORY_CONTRACT_DRY_RUN_PASSED',
      }),
      expect.objectContaining({
        phase: 'knowledge',
        status: 'warn',
        code: 'BUSINESS_FACTORY_KNOWLEDGE_SMOKE_NOT_RUN',
      }),
      expect.objectContaining({
        phase: 'delivery',
        status: 'warn',
        code: 'BUSINESS_FACTORY_DELIVERY_NOT_DECLARED',
      }),
    ]))
    expect(result.graph.nodes).toHaveLength(10)
    expect(result.graph.edges).toHaveLength(9)
    expect(result.graph.nodes.find(node => node.id === 'F3')).toMatchObject({
      data: {
        acceptancePhase: 'contract',
        status: 'passed',
      },
    })
    expect(result.graph.nodes.find(node => node.id === 'F9')).toMatchObject({
      data: {
        acceptancePhase: 'delivery',
        status: 'warning',
      },
    })
    expect(result.graph.nodes.find(node => node.id === 'F8')).toMatchObject({
      data: {
        acceptancePhase: 'workOrder',
        status: 'ready',
      },
    })
  })

  it('accepts supplemental factory checks to complete the acceptance report', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() }).ensure('demo', {
      moduleId: 'demo.module',
      create: () => createRegistration('demo.module'),
    })

    const result = host.inspectFactory('demo', {
      id: 'demo-1',
      prompt: 'Build demo',
    }, {
      materialsChecks: [passCheck('materials', 'BUSINESS_FACTORY_MATERIALS_OK')],
      knowledgeChecks: [passCheck('knowledge', 'BUSINESS_FACTORY_KNOWLEDGE_OK')],
      governanceChecks: [passCheck('governance', 'BUSINESS_FACTORY_GOVERNANCE_OK')],
      deliveryChecks: [passCheck('delivery', 'BUSINESS_FACTORY_DELIVERY_OK')],
    })

    expect(result.report.status).toBe('pass')
    expect(result.graph.nodes.find(node => node.id === 'F2')).toMatchObject({
      data: {
        acceptancePhase: 'knowledge',
        status: 'passed',
      },
    })
    expect(result.graph.nodes.find(node => node.id === 'F9')).toMatchObject({
      data: {
        acceptancePhase: 'delivery',
        status: 'passed',
      },
    })
  })

  it('fails identity checks when declared factory identity conflicts with host facts', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() }).ensure('demo', {
      moduleId: 'demo.module',
      create: () => createRegistration('demo.module'),
    })

    const result = host.inspectFactory('demo', {
      id: 'demo-1',
      prompt: 'Build demo',
    }, {
      moduleId: 'wrong.module',
      rootClassName: 'WrongBusiness',
      materialsChecks: [passCheck('materials', 'BUSINESS_FACTORY_MATERIALS_OK')],
      knowledgeChecks: [passCheck('knowledge', 'BUSINESS_FACTORY_KNOWLEDGE_OK')],
      governanceChecks: [passCheck('governance', 'BUSINESS_FACTORY_GOVERNANCE_OK')],
      deliveryChecks: [passCheck('delivery', 'BUSINESS_FACTORY_DELIVERY_OK')],
    })

    expect(result.report).toMatchObject({
      moduleId: 'demo.module',
      rootClassName: 'DemoBusiness',
      status: 'fail',
    })
    expect(result.report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'identity',
        status: 'fail',
        code: 'BUSINESS_FACTORY_MODULE_ID_MISMATCH',
      }),
      expect.objectContaining({
        phase: 'identity',
        status: 'fail',
        code: 'BUSINESS_FACTORY_ROOT_CLASS_MISMATCH',
      }),
    ]))
    expect(result.graph.nodes.find(node => node.id === 'F8')).toMatchObject({
      data: {
        acceptancePhase: 'workOrder',
        status: 'idle',
      },
    })
  })

  it('does not mark work order ready when runtime inspect fails', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() }).ensure('demo', {
      moduleId: 'demo.module',
      create: () => createRegistration('demo.module', createRuntime('error')),
    })

    const result = host.inspectFactory('demo', {
      id: 'demo-1',
      prompt: 'Build demo',
    }, {
      materialsChecks: [passCheck('materials', 'BUSINESS_FACTORY_MATERIALS_OK')],
      knowledgeChecks: [passCheck('knowledge', 'BUSINESS_FACTORY_KNOWLEDGE_OK')],
      governanceChecks: [passCheck('governance', 'BUSINESS_FACTORY_GOVERNANCE_OK')],
      deliveryChecks: [passCheck('delivery', 'BUSINESS_FACTORY_DELIVERY_OK')],
    })

    expect(result.report.status).toBe('fail')
    expect(result.report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'runtime',
        status: 'fail',
        code: 'BUSINESS_FACTORY_RUNTIME_INSPECT',
      }),
    ]))
    expect(result.graph.nodes.find(node => node.id === 'F4')).toMatchObject({
      data: {
        acceptancePhase: 'runtime',
        status: 'failed',
      },
    })
    expect(result.graph.nodes.find(node => node.id === 'F8')).toMatchObject({
      data: {
        acceptancePhase: 'workOrder',
        status: 'idle',
      },
    })
  })

  it('returns a failed business factory report for an unknown alias', () => {
    const host = createAiAgentHost({ turnCallbacks: createTurnCallbacks() })

    const result = host.inspectFactory('missing', {
      id: 'demo-1',
      prompt: 'Build demo',
    })

    expect(result.dryRun.ok).toBe(false)
    expect(result.report.status).toBe('fail')
    expect(result.report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: 'contract',
        status: 'fail',
        code: 'BUSINESS_FACTORY_DRY_RUN_FAILED',
      }),
      expect.objectContaining({
        phase: 'activation',
        status: 'fail',
        code: 'BUSINESS_FACTORY_ACTIVATION_MISSING',
      }),
    ]))
    expect(result.graph.nodes.find(node => node.id === 'F7')).toMatchObject({
      data: {
        acceptancePhase: 'activation',
        status: 'failed',
      },
    })
    expect(result.graph.nodes.find(node => node.id === 'F8')).toMatchObject({
      data: {
        acceptancePhase: 'workOrder',
        status: 'idle',
      },
    })
  })
})

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

function passCheck(
  phase: BusinessFactoryWorkflowPhaseKind,
  code: string,
): BusinessFactoryCheck {
  return {
    phase,
    status: 'pass',
    code,
    message: `${code} passed.`,
  }
}

function createRuntime(status: 'ok' | 'warning' | 'error' = 'ok'): AiAgentToolRuntime {
  return {
    getTools: () => [],
    executeTool: async () => AiAgentToolResult.ok({}),
    projectKnowledge: () => ({ promptSnapshot: 'DemoBusiness runtime.' }),
    inspect: () => ({
      status,
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
