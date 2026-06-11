import { describe, expect, it } from 'vitest'

describe('@spark-appworks/spark-ai root public surface', () => {
  it('keeps the package root as a small facade over json/class-model/agent', async () => {
    const rootModule = await import('../index')

    expect(rootModule.paramsSchema).toBeTypeOf('function')
    expect(rootModule.ClassModelRuntime).toBeTypeOf('function')
    expect(rootModule.createAiAgentHost).toBeTypeOf('function')
    expect(rootModule.DefaultAiAgentSessionStore).toBeTypeOf('function')
    expect(Object.keys(rootModule).sort()).toEqual([
      'AiJsonSchemaValidator',
      'ClassModelRuntime',
      'DefaultAiAgentSessionStore',
      'createAiAgentHost',
      'noParamsSchema',
      'paramsSchema',
      'startAiAgentRegistrationSession',
    ])
  })
})
