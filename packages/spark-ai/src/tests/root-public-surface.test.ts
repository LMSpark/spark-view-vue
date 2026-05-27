import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  AiJsonParams as RootAiJsonParams,
  AiModuleOptions as RootAiModuleOptions,
} from '../index'
import type {
  AiModuleOptions as ModulesAiModuleOptions,
} from '../modules'
import type {
  AiJsonParams as JsonAiJsonParams,
} from '../json'

describe('@spark-view/spark-ai root public surface', () => {
  it('keeps the package root as a small facade over json/modules/agent', async () => {
    const rootModule = await import('../index')

    expect(rootModule.paramsSchema).toBeTypeOf('function')
    expect(rootModule.AiModule).toBeTypeOf('function')
    expect(rootModule.AiModuleRuntime).toBeTypeOf('function')
    expect(rootModule.AI_AGENT_HOST).toBeTypeOf('object')
    expect(rootModule.AiAgentHost).toBeTypeOf('function')
    expect(rootModule.createAiAgentHost).toBeTypeOf('function')
    expect(rootModule.DefaultAiAgentSessionStore).toBeTypeOf('function')
  })

  it('does not expose removed dynamic protocol and old host facade names', async () => {
    const rootModule = await import('../index')
    const exposed = new Set(Object.keys(rootModule))

    expect(exposed.has('AiModuleConstructor')).toBe(false)
    expect(exposed.has('AiModuleToolCodec')).toBe(false)
    expect(exposed.has('PROTOCOL_TOOL_NAMES')).toBe(false)
    expect(exposed.has('AiAgent')).toBe(false)
    expect(exposed.has('createAiAgent')).toBe(false)
    expect(exposed.has('createAiAgentTask')).toBe(false)
    expect(exposed.has('createTurnEventCollector')).toBe(false)
  })

  it('keeps facade types aligned with focused entries', () => {
    expectTypeOf<RootAiJsonParams>().toEqualTypeOf<JsonAiJsonParams>()
    expectTypeOf<RootAiModuleOptions>().toEqualTypeOf<ModulesAiModuleOptions>()
  })
})
