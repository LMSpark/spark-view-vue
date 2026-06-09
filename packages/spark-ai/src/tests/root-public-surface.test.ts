import { describe, expect, it } from 'vitest'

describe('@spark-appworks/spark-ai root public surface', () => {
  it('keeps the package root as a small facade over json/vcm-native/agent', async () => {
    const rootModule = await import('../index')

    expect(rootModule.paramsSchema).toBeTypeOf('function')
    expect(rootModule.VcmNativeRuntime).toBeTypeOf('function')
    expect(rootModule.createAiAgentHost).toBeTypeOf('function')
    expect(rootModule.DefaultAiAgentSessionStore).toBeTypeOf('function')
    expect(Object.keys(rootModule).sort()).toEqual([
      'AiJsonSchemaValidator',
      'DefaultAiAgentSessionStore',
      'VcmNativeRuntime',
      'createAiAgentHost',
      'noParamsSchema',
      'paramsSchema',
      'startAiAgentRegistrationSession',
    ])
  })

  it('does not expose removed dynamic protocol and old host facade names', async () => {
    const rootModule = await import('../index')
    const exposed = new Set(Object.keys(rootModule))

    expect(exposed.has('AiModuleConstructor')).toBe(false)
    expect(exposed.has('AiModule')).toBe(false)
    expect(exposed.has('AiModuleRuntime')).toBe(false)
    expect(exposed.has('AiModuleResult')).toBe(false)
    expect(exposed.has('AiModuleToolCodec')).toBe(false)
    expect(exposed.has('PROTOCOL_TOOL_NAMES')).toBe(false)
    expect(exposed.has('AiAgent')).toBe(false)
    expect(exposed.has('createAiAgent')).toBe(false)
    expect(exposed.has('createAiAgentTask')).toBe(false)
    expect(exposed.has('createAiAgentRegistration')).toBe(false)
    expect(exposed.has('createTurnEventCollector')).toBe(false)
  })
})
