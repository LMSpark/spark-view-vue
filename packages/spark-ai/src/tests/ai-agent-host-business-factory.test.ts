import { describe, expect, it } from 'vitest'

import {
  AiAgentRegistration,
  AiAgentToolResult,
  createAiAgentHost,
  DefaultAiAgentSessionStore,
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
})

function createRegistration(moduleId: string): AiAgentRegistration {
  return new AiAgentRegistration({
    moduleId,
    name: 'Demo module',
    description: 'Demo module business.',
    runtime: createRuntime(),
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
