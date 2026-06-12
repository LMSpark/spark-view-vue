import { describe, expect, it } from 'vitest'
import { appAiAgent, createAiAgentTurnCallbacks } from '@/services/ai/ai-turn-bridge'

describe('appAiAgent', () => {
  it('exports production host singleton wired to session-turn transport', () => {
    expect(appAiAgent).toBeDefined()
    expect(typeof appAiAgent.has).toBe('function')
    expect(typeof createAiAgentTurnCallbacks).toBe('function')
  })
})
