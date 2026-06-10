import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAiAgentHost: vi.fn(() => ({ has: vi.fn() })),
  createAiAgentTurnCallbacks: vi.fn(() => ({ executeTurn: vi.fn(), appendMessages: vi.fn() })),
}))

vi.mock('@spark-appworks/spark-ai/agent', () => ({
  createAiAgentHost: mocks.createAiAgentHost,
}))

vi.mock('@/services/ai-turn-bridge', () => ({
  createAiAgentTurnCallbacks: mocks.createAiAgentTurnCallbacks,
}))

describe('appAiAgent', () => {
  it('uses APP SSE turn callbacks', async () => {
    await import('@/services/ai-host')

    expect(mocks.createAiAgentTurnCallbacks).toHaveBeenCalledWith({ transport: 'app-sse' })
    expect(mocks.createAiAgentHost).toHaveBeenCalledWith(expect.objectContaining({
      maxToolRounds: 16,
    }))
  })
})
