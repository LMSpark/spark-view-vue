import { beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => {
  const createSession = vi.fn(() => ({ session: 'local-stills-session' }))
  const createOrchestratorConfig = vi.fn((options) => ({
    builtFrom: options,
    maxRounds: 99,
    slidingWindow: 12,
    systemPrompt: 'built-system-prompt',
    monitors: [],
    followUpPolicy: { buildFollowUps: () => [] },
  }))
  const runStillsLoop = vi.fn(async (_userPrompt, _session, _backend, config) => ({
    turns: [],
    rounds: 1,
    aborted: false,
    completed: false,
    sessionId: 'mock-session-id',
    ...((config as { __resultOverride?: Record<string, unknown> }).__resultOverride ?? {}),
  }))

  return {
    createSession,
    createOrchestratorConfig,
    runStillsLoop,
  }
})

vi.mock('../packages/spark-ai/src/core/stills/domain', () => ({
  createSession: shared.createSession,
}))

vi.mock('../packages/spark-ai/src/business/project-planning/orchestrator-config-factory', () => ({
  createOrchestratorConfig: shared.createOrchestratorConfig,
}))

vi.mock('../packages/spark-ai/src/core/orchestration/session-orchestrator', () => ({
  runStillsLoop: shared.runStillsLoop,
}))

import {
  startAiOrchestration,
  startGenerateSession,
} from '../packages/spark-ai/src/business/project-planning/ai-orchestration-bootstrap'

describe('ai-orchestration-bootstrap', () => {
  beforeEach(() => {
    shared.createSession.mockClear()
    shared.createOrchestratorConfig.mockClear()
    shared.runStillsLoop.mockClear()
  })

  it('forwards optional business config into createOrchestratorConfig', async () => {
    const backend = { id: 'backend' } as never
    const signal = new AbortController().signal
    const onSseEvent = vi.fn()
    const onRoundStart = vi.fn()
    const onTurnComplete = vi.fn()
    const onRoundComplete = vi.fn()

    await startAiOrchestration({
      backend,
      userPrompt: 'edit prompt',
      systemPrompt: 'system prompt',
      scenario: 'iterate',
      maxRounds: 80,
      slidingWindow: 12,
      resumeSessionId: 'resume-1',
      signal,
      onSseEvent,
      onRoundStart,
      onTurnComplete,
      onRoundComplete,
      businessContext: {
        pageName: 'orders-page',
        phase: 'rule-edit',
      },
      useBusinessFollowUpPolicy: true,
      tools: [],
      repeatDetection: {
        maxSameSignature: 6,
        maxConsecutiveErrors: 6,
        maxCyclePeriod: 4,
        cycleRepeatThreshold: 2,
        maxReadOnlyActions: 36,
        maxMissingComponentRetries: 2,
      },
    })

    expect(shared.createSession).toHaveBeenCalledTimes(1)
    expect(shared.createOrchestratorConfig).toHaveBeenCalledWith({
      backend,
      userPrompt: 'edit prompt',
      systemPrompt: 'system prompt',
      scenario: 'iterate',
      maxRounds: 80,
      slidingWindow: 12,
      resumeSessionId: 'resume-1',
      signal,
      onSseEvent,
      onRoundStart,
      onTurnComplete,
      onRoundComplete,
      businessContext: {
        pageName: 'orders-page',
        phase: 'rule-edit',
      },
      useBusinessFollowUpPolicy: true,
      tools: [],
      repeatDetection: {
        maxSameSignature: 6,
        maxConsecutiveErrors: 6,
        maxCyclePeriod: 4,
        cycleRepeatThreshold: 2,
        maxReadOnlyActions: 36,
        maxMissingComponentRetries: 2,
      },
    })
    expect(shared.runStillsLoop).toHaveBeenCalledWith(
      'edit prompt',
      { session: 'local-stills-session' },
      backend,
      expect.objectContaining({
        builtFrom: expect.objectContaining({
          repeatDetection: expect.objectContaining({
            maxSameSignature: 6,
            maxReadOnlyActions: 36,
          }),
        }),
      }),
    )
  })

  it('applies generate scenario preset without type assertions', async () => {
    const backend = { id: 'backend' } as never

    await startGenerateSession({
      backend,
      userPrompt: 'generate prompt',
      systemPrompt: 'system prompt',
    })

    expect(shared.createOrchestratorConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        scenario: 'generate',
        userPrompt: 'generate prompt',
        systemPrompt: 'system prompt',
      }),
    )
  })
})
