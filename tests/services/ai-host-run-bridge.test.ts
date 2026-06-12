import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiAgentHostRunResult } from '@spark-appworks/spark-ai/agent'
import { createAiHostRunBridge } from '@/services/ai/ai-host-run-bridge'
import { attachAiDeliveryResult, type AiDeliveryResult } from '@/services/ai/ai-delivery-port'

const httpPost = vi.fn()
const subscribers = new Map<string, Set<(data: unknown) => void>>()

const savedDelivery: AiDeliveryResult = {
  mode: 'auto',
  status: 'saved',
  artifacts: [{ kind: 'navigation', name: 'navigation', status: 'saved' }],
}

const failedDelivery: AiDeliveryResult = {
  mode: 'auto',
  status: 'failed',
  artifacts: [{ kind: 'navigation', name: 'navigation', status: 'dirty' }],
  message: 'save failed',
}

vi.mock('@/services/http', () => ({
  http: {
    post: (...args: unknown[]) => httpPost(...args),
  },
}))

vi.mock('@/services/sse-events', () => ({
  onAiHostRunRequest: (callback: (event: unknown) => void) => {
    const set = subscribers.get('ai-host-run-request') ?? new Set()
    set.add(callback)
    subscribers.set('ai-host-run-request', set)
    return () => set.delete(callback)
  },
}))

function emitHostRunRequest(event: Record<string, unknown>): void {
  const set = subscribers.get('ai-host-run-request')
  if (set === undefined) return
  for (const callback of set) callback(event)
}

describe('createAiHostRunBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscribers.clear()
    httpPost.mockResolvedValue({ ok: true })
  })

  it('posts ai-host-run-result when host run completes', async () => {
    const run = vi.fn(async (): Promise<AiAgentHostRunResult> => ({
      task: { toChatRequest: () => ({ messages: [] }) } as never,
      session: {
        sessionId: 'session-1',
        scope: { businessRegistrationId: 'projectPlanning', businessInstanceId: 'lmspark:hr' },
      } as never,
      resultExtras: {
        delivery: savedDelivery,
      },
    }))
    const host = {
      has: vi.fn(() => true),
      dryRun: vi.fn(() => ({
        ok: true as const,
        alias: 'projectPlanning',
        moduleId: 'projectPlanning',
        normalizedInput: {},
        scope: {} as never,
        orchestration: { userMessage: '需求', systemPrompt: '' },
        orchestrationSummary: { userMessageLength: 2, systemPromptLength: 0, readonlyStepCount: 0 },
        tools: [],
        inspectReport: {} as never,
        diagnostics: [],
      })),
      run,
    }

    createAiHostRunBridge({ host, defaultTimeoutMs: 5_000 }).start()
    emitHostRunRequest({
      requestId: 'bridge-test-1',
      alias: 'projectPlanning',
      args: { tenantId: 'lmspark', projectId: 'hr-enterprise-planning-smoke', requirement: 'test' },
      timestamp: Date.now(),
      timeoutMs: 5_000,
    })

    await vi.waitFor(() => {
      expect(httpPost).toHaveBeenCalledWith('/api/ai/host-run/result', expect.objectContaining({
        requestId: 'bridge-test-1',
        status: 'completed',
        delivery: savedDelivery,
      }))
    })
    expect(run).toHaveBeenCalledOnce()
  })

  it('posts delivery extras when host run fails during delivery', async () => {
    const host = {
      has: vi.fn(() => true),
      dryRun: vi.fn(() => ({
        ok: true as const,
        alias: 'projectPlanning',
        moduleId: 'projectPlanning',
        normalizedInput: {},
        scope: {} as never,
        orchestration: { userMessage: '需求', systemPrompt: '' },
        orchestrationSummary: { userMessageLength: 2, systemPromptLength: 0, readonlyStepCount: 0 },
        tools: [],
        inspectReport: {} as never,
        diagnostics: [],
      })),
      run: vi.fn(async () => {
        throw attachAiDeliveryResult(new Error('save failed'), failedDelivery)
      }),
    }

    createAiHostRunBridge({ host, defaultTimeoutMs: 5_000 }).start()
    emitHostRunRequest({
      requestId: 'bridge-test-delivery-failed',
      alias: 'projectPlanning',
      args: { tenantId: 'lmspark', projectId: 'hr-enterprise-planning-smoke', requirement: 'test' },
      timestamp: Date.now(),
      timeoutMs: 5_000,
    })

    await vi.waitFor(() => {
      expect(httpPost).toHaveBeenCalledWith('/api/ai/host-run/result', expect.objectContaining({
        requestId: 'bridge-test-delivery-failed',
        status: 'failed',
        delivery: failedDelivery,
        error: expect.objectContaining({
          code: 'AI_HOST_RUN_DELIVERY_FAILED',
        }),
      }))
    })
  })

  it('posts timeout result when host run exceeds timeout', async () => {
    const host = {
      has: vi.fn(() => true),
      dryRun: vi.fn(() => ({
        ok: true as const,
        alias: 'projectPlanning',
        moduleId: 'projectPlanning',
        normalizedInput: {},
        scope: {} as never,
        orchestration: { userMessage: '需求', systemPrompt: '' },
        orchestrationSummary: { userMessageLength: 2, systemPromptLength: 0, readonlyStepCount: 0 },
        tools: [],
        inspectReport: {} as never,
        diagnostics: [],
      })),
      run: vi.fn((): Promise<AiAgentHostRunResult> => new Promise(() => undefined)),
    }

    createAiHostRunBridge({ host, defaultTimeoutMs: 50 }).start()
    emitHostRunRequest({
      requestId: 'bridge-test-timeout',
      alias: 'projectPlanning',
      args: { requirement: 'test' },
      timestamp: Date.now(),
      timeoutMs: 50,
    })

    await vi.waitFor(() => {
      expect(httpPost).toHaveBeenCalledWith('/api/ai/host-run/result', expect.objectContaining({
        requestId: 'bridge-test-timeout',
        status: 'timeout',
      }))
    }, { timeout: 2_000 })
  })
})
