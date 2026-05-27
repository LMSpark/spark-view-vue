import { describe, expect, it } from 'vitest'

describe('@spark-view/spark-ai/host public surface', () => {
  it('exports only the stable runtime symbols from the host barrel', async () => {
    const hostModule = await import('../host')

    expect(Object.keys(hostModule).sort()).toEqual([
      'AI_HOST',
      'AiHost',
      'AiHostBusinessRegistration',
      'AiHostBusinessRuntimeContext',
      'AiHostBusinessScope',
      'AiHostBusinessSession',
      'AiHostBusinessTask',
      'AiHostBusinessTarget',
      'AiHostSessionStore',
      'AiHostToolLoopRunner',
      'DefaultAiHostSessionStore',
      'createAiHostBusinessScope',
      'createAiHostBusinessSession',
      'createAiHostBusinessTask',
      'createAiHost',
      'createAiHostTransportTurn',
      'createAiHostSessionTranscript',
      'createTurnEventCollector',
      'previewAiHostDiagnosticValue',
      'projectAiHostBusinessRegistration',
      'runAiHostBusiness',
      'startRegistrationSession',
      'summarizeAiHostSessionRecord',
      'toAiHostRuntimeScope',
    ].sort())
  })

  it('keeps host implementation helpers out of the public barrel', async () => {
    const hostModule = await import('../host')
    const exposed = new Set(Object.keys(hostModule))

    expect(exposed.has('latestUserInput')).toBe(false)
    expect(exposed.has('normalizeTurn')).toBe(false)
    expect(exposed.has('toCurrentTurnMessages')).toBe(false)
    expect(exposed.has('AiHostMessageSender')).toBe(false)
    expect(exposed.has('createAiHostBusinessSessionId')).toBe(false)
    expect(exposed.has('createAiHostBusinessStorageKey')).toBe(false)
    expect(exposed.has('AiHostBusinessRegistry')).toBe(false)
    expect(exposed.has('ModuleSemanticToolCodec')).toBe(false)
    expect(exposed.has('createAiHostStreamKey')).toBe(false)
    expect(exposed.has('normalizeAiHostBusinessTarget')).toBe(false)
    expect(exposed.has('emitLlmDiagnosticEvent')).toBe(false)
    expect(exposed.has('eventModuleIdFromProtocolCall')).toBe(false)
    expect(exposed.has('stringifyAiHostPayload')).toBe(false)
  })
})
