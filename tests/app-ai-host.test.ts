import { describe, expect, it, vi } from 'vitest'
import { PAGE_DESIGN_MODULE_ID } from '@spark-view/spark-ai'
import type { PageDesignEditHost } from '@spark-view/spark-page-config'
import {
  AppAiBusinessRegistry,
  AppAiHost,
  registerAppAiBusinesses,
  type AppAiHostTransport,
} from '@/services/ai-host'
import type { AppAiCreateSessionInput, AppAiStreamTurnInput } from '@/services/ai-host'

function resolveMaybeGetter<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

describe('AppAiHost', () => {
  it('routes through registered leave-request runtime and switches persistence after selection', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      resolveLeaveDraftId: () => 'leave-draft-1',
    })

    const createdSessions: AppAiCreateSessionInput[] = []
    const streamedTurns: AppAiStreamTurnInput[] = []
    const transport: AppAiHostTransport = {
      routeBusiness: vi.fn(async () => ({ moduleId: 'manualLeave', confidence: 0.95, reason: 'leave request' })),
      createSession: vi.fn(async (input) => {
        createdSessions.push(input)
        return 'session-1'
      }),
      streamTurn: vi.fn(async (input) => {
        streamedTurns.push(input)
        input.onDelta?.('请假已进入草稿')
        return { text: '请假已进入草稿', toolCalls: [] }
      }),
      appendMessages: vi.fn(async () => {}),
    }
    const host = new AppAiHost({ registry, transport })
    const config = host.createPanelConfig()
    const onDelta = vi.fn()

    expect(resolveMaybeGetter(config.disablePersistence ?? false)).toBe(true)

    await config.sender({
      historyMsgs: [{ role: 'user', content: '我要请假两天' }],
      mode: 'multi',
      onDelta,
    })

    expect(createdSessions[0]?.scope).toMatchObject({
      businessRegistrationId: 'manualLeave',
      businessInstanceId: 'leave-draft-1',
    })
    expect(createdSessions[0]?.messages).toEqual([{ role: 'user', content: '我要请假两天' }])
    expect(streamedTurns[0]?.scope.businessInstanceId).toBe('leave-draft-1')
    expect(resolveMaybeGetter(config.disablePersistence ?? false)).toBe(false)
    expect(resolveMaybeGetter(config.storageKey)).toBe('spark-ai-session:manualLeave:leave-draft-1')
    expect(onDelta).toHaveBeenCalledWith(expect.stringContaining('人工请假'))
    expect(onDelta).toHaveBeenCalledWith('请假已进入草稿')
  })

  it('registers PageDesign only in the composition root when an edit host is provided', () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({
      registry,
      getPageDesignEditHost: () => ({}) as PageDesignEditHost,
    })

    expect(registry.get('manualLeave')).toBeDefined()
    expect(registry.get(PAGE_DESIGN_MODULE_ID)).toBeDefined()
  })
})