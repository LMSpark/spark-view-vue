import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ModuleAttributeAccess as RootModuleAttributeAccess,
  ModuleOperationResultOptions as RootModuleOperationResultOptions,
} from '../index'
import type {
  ModuleAttributeAccess as SemanticModuleAttributeAccess,
  ModuleOperationResultOptions as SemanticModuleOperationResultOptions,
} from '../module-semantic'

describe('@spark-view/spark-ai root public surface', () => {
  it('exposes stable schema, module-semantic, and host entry symbols', async () => {
    const rootModule = await import('../index')

    expect(rootModule.paramsSchema).toBeTypeOf('function')
    expect(rootModule.ModuleKind).toBeTypeOf('function')
    expect(rootModule.ModuleSemanticRuntime).toBeTypeOf('function')
    expect(rootModule.ModuleParameterPayloadRegistry).toBeTypeOf('function')
    expect(rootModule.AiHostBusinessSession).toBeTypeOf('function')
    expect(rootModule.AiHostBusinessTask).toBeTypeOf('function')
    expect(rootModule.createAiHostBusinessTask).toBeTypeOf('function')
    expect(rootModule.createAiHostTransportTurn).toBeTypeOf('function')
    expect(rootModule.createTurnEventCollector).toBeTypeOf('function')
  })

  it('keeps implementation helpers and business modules out of the package root', async () => {
    const rootModule = await import('../index')
    const exposed = new Set(Object.keys(rootModule))

    expect(exposed.has('latestUserInput')).toBe(false)
    expect(exposed.has('normalizeTurn')).toBe(false)
    expect(exposed.has('AiHostMessageSender')).toBe(false)
    expect(exposed.has('toTransportTurn')).toBe(false)
    expect(exposed.has('readAppendMessagesEnvelope')).toBe(false)
    expect(exposed.has('parseAiHostStreamFrames')).toBe(false)
    expect(exposed.has('createAiHostSessionTranscript')).toBe(false)
    expect(exposed.has('PageDesignService')).toBe(false)
    expect(exposed.has('PageDesignNodeTreeModuleKind')).toBe(false)
  })

  it('keeps stable protocol type exports available from public entries', () => {
    expectTypeOf<RootModuleAttributeAccess>().toEqualTypeOf<SemanticModuleAttributeAccess>()
    expectTypeOf<RootModuleOperationResultOptions<string>>()
      .toEqualTypeOf<SemanticModuleOperationResultOptions<string>>()
  })
})
