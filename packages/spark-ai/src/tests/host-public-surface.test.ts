import { describe, expect, it } from 'vitest'

describe('@spark-view/spark-ai/agent public surface', () => {
  it('exports only the stable runtime symbols from the host barrel', async () => {
    const hostModule = await import('../agent')

    expect(Object.keys(hostModule).sort()).toEqual([
      'AI_AGENT_HOST',
      'AiAgentHost',
      'AiAgentRegistration',
      'AiAgentRuntimeContext',
      'AiAgentScope',
      'AiAgentSession',
      'AiAgentSessionStore',
      'AiAgentTask',
      'AiAgentTarget',
      'AiAgentToolLoopRunner',
      'DefaultAiAgentSessionStore',
      'createAiAgentHost',
      'createAiAgentRegistration',
      'createAiAgentScope',
      'createAiAgentSession',
      'createAiAgentTask',
      'createAiAgentSessionTranscript',
      'createAiAgentTransportTurn',
      'createTurnEventCollector',
      'previewAiAgentDiagnosticValue',
      'runAiAgent',
      'startAiAgentRegistrationSession',
      'summarizeAiAgentSessionRecord',
      'toAiAgentRuntimeScope',
    ].sort())
  })

  it('keeps host implementation helpers out of the public barrel', async () => {
    const hostModule = await import('../agent')
    const exposed = new Set(Object.keys(hostModule))

    expect(exposed.has('latestUserInput')).toBe(false)
    expect(exposed.has('normalizeTurn')).toBe(false)
    expect(exposed.has('toCurrentTurnMessages')).toBe(false)
    expect(exposed.has('AiAgentMessageSender')).toBe(false)
    expect(exposed.has('createAiAgentSessionId')).toBe(false)
    expect(exposed.has('createAiAgentBusinessStorageKey')).toBe(false)
    expect(exposed.has('AiAgentRegistry')).toBe(false)
    expect(exposed.has('AiModuleToolCodec')).toBe(false)
    expect(exposed.has('AiAgent')).toBe(false)
    expect(exposed.has('createAiAgent')).toBe(false)
    expect(exposed.has('createAiAgentStreamKey')).toBe(false)
    expect(exposed.has('normalizeAiAgentTarget')).toBe(false)
    expect(exposed.has('emitLlmDiagnosticEvent')).toBe(false)
    expect(exposed.has('eventModuleIdFromProtocolCall')).toBe(false)
    expect(exposed.has('stringifyAiAgentPayload')).toBe(false)
  })
})
