import { afterEach, describe, expect, it, vi } from 'vitest'
import { PAGE_DESIGN_MODULE_ID } from '@spark-view/spark-ai'
import type { PageDesignEditHost } from '@spark-view/spark-page-config'
import {
  AppAiBusinessRegistry,
  AppAiHost,
  FetchAppAiHostTransport,
  registerAppAiBusinesses,
  uploadAppAiAttachment,
  type AppAiHostTransport,
} from '@/services/ai-host'
import type { AppAiCreateSessionInput, AppAiStreamTurnInput } from '@/services/ai-host'

function resolveMaybeGetter<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('sends auth and tenant headers through the fetch transport', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sessionId: 'session-1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = new FetchAppAiHostTransport('/api/ai', () => ({
      Authorization: 'Bearer token-1',
      'X-Tenant-Id': 'tenant-1',
      'X-Project-Id': 'project-1',
    }))

    await transport.createSession({
      systemPrompt: 'system',
      messages: [],
      tools: [],
      scope: {
        businessRegistrationId: 'manualLeave',
        businessInstanceId: 'draft-1',
        instanceId: 'ai:manualLeave:draft-1',
        runtimeInstanceId: 'ai:manualLeave:draft-1',
      },
      turn: {
        turnId: 'turn-1',
        seq: 1,
        baseRevision: 0,
        queuedAt: '2026-05-13T00:00:00.000Z',
        startedAt: '2026-05-13T00:00:00.000Z',
        maxParallelTurns: 1,
      },
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
      'X-Tenant-Id': 'tenant-1',
      'X-Project-Id': 'project-1',
    })
  })

  it('uploads AI attachments with auth headers and FormData body', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      fileId: 'file-1',
      name: 'note.txt',
      size: 5,
      mimeType: 'text/plain',
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })

    const result = await uploadAppAiAttachment(file, '/api/ai', () => ({ Authorization: 'Bearer token-1' }))

    expect(result).toEqual({
      fileId: 'file-1',
      name: 'note.txt',
      size: 5,
      mimeType: 'text/plain',
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/upload')
    expect(init.headers).toEqual({ Authorization: 'Bearer token-1' })
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBe(file)
  })
})
