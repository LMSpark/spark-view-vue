import { describe, expect, it, vi } from 'vitest'

import {
  AppAiBusinessRegistry,
  FetchAppAiTransport,
  createAppAiRuntimeMonitor,
  registerAppAiBusinesses,
  uploadAppAiAttachment,
  type AppAiTransport,
} from '@/services/app-ai'
import type { AiHostStreamTurnInput } from '@spark-view/spark-ai/host'

describe('App AI panel resolver', () => {
  it('starts explicit business sessions and enumerates AI core ledger sessions', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({ registry })

    const streamedTurns: AiHostStreamTurnInput[] = []
    const transport: AppAiTransport = {
      streamTurn: vi.fn(async (input) => {
        streamedTurns.push(input)
        input.onDelta?.('已进入请假草稿')
        return { text: '已进入请假草稿', toolCalls: [] }
      }),
      appendMessages: vi.fn(async () => {}),
    }
    const monitor = createAppAiRuntimeMonitor({ registry, transport })

    const config = await monitor.resolveRuntimeSession({
      target: {
        businessRegistrationId: 'manualLeave',
        businessInstanceId: 'leave-draft-1',
      },
      title: '人工请假',
    })

    expect(config.storageKey).toBe('spark-ai:manualLeave:leave-draft-1')

    await config.sender({
      historyMsgs: [{ role: 'user', content: '我要请假两天' }],
      mode: 'multi',
    })

    expect(streamedTurns[0]).toMatchObject({
      sessionId: 'manualLeave:leave-draft-1',
      scope: {
        businessRegistrationId: 'manualLeave',
        businessInstanceId: 'leave-draft-1',
      },
    })

    const snapshot = monitor.getSnapshot()
    expect(snapshot.activeSessionId).toBe('manualLeave:leave-draft-1')
    expect(snapshot.sessions).toHaveLength(1)
    expect(snapshot.sessions[0]).toMatchObject({
      sessionId: 'manualLeave:leave-draft-1',
      storageKey: 'spark-ai:manualLeave:leave-draft-1',
      target: {
        businessRegistrationId: 'manualLeave',
        businessInstanceId: 'leave-draft-1',
      },
      session: {
        moduleId: 'manualLeave',
        moduleInstanceId: 'leave-draft-1',
        status: 'Started',
      },
    })
    expect(snapshot.sessions[0]?.session?.history.some((entry) => (
      entry.kind === 'message' && entry.content === '我要请假两天'
    ))).toBe(true)
  })

  it('keeps business instances isolated by core ledger scope', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({ registry })
    const monitor = createAppAiRuntimeMonitor({
      registry,
      transport: {
        streamTurn: vi.fn(async () => ({ text: 'ok', toolCalls: [] })),
        appendMessages: vi.fn(async () => {}),
      },
    })

    await monitor.resolveRuntimeSession({
      target: { businessRegistrationId: 'manualLeave', businessInstanceId: 'leave-a' },
    })
    await monitor.resolveRuntimeSession({
      target: { businessRegistrationId: 'manualLeave', businessInstanceId: 'leave-b' },
    })

    expect(monitor.getSnapshot().sessions.map((session) => session.storageKey).sort()).toEqual([
      'spark-ai:manualLeave:leave-a',
      'spark-ai:manualLeave:leave-b',
    ])
  })

  it('allows monitor-side human intervention through the registered runtime', async () => {
    const registry = new AppAiBusinessRegistry()
    registerAppAiBusinesses({ registry })
    const monitor = createAppAiRuntimeMonitor({
      registry,
      transport: {
        streamTurn: vi.fn(async () => ({ text: 'ok', toolCalls: [] })),
        appendMessages: vi.fn(async () => {}),
      },
    })

    await monitor.resolveRuntimeSession({
      target: { businessRegistrationId: 'manualLeave', businessInstanceId: 'leave-human' },
    })

    const entry = monitor.appendHumanMessage('manualLeave:leave-human', '人工确认补充材料')
    expect(entry).toMatchObject({
      kind: 'message',
      role: 'user',
      source: 'ui',
      content: '人工确认补充材料',
      metadata: { intervention: 'human' },
    })

    await monitor.closeSession('manualLeave:leave-human', '人工关闭')
    expect(monitor.getSnapshot().sessions[0]?.session?.status).toBe('Stopped')
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

describe('FetchAppAiTransport', () => {
  it('keeps stream turn envelopes scoped to the explicit business target', async () => {
    const sessionId = 'manualLeave:draft-1'
    const fetchMock = vi.fn(async () => new Response([
      'event: result',
      `data: ${JSON.stringify({
        sessionId,
        turnId: 'turn-1',
        text: 'ok',
      })}`,
      '',
      '',
    ].join('\n'), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const transport = new FetchAppAiTransport('/api/ai')

    const result = await transport.streamTurn({
      sessionId,
      scope: {
        businessRegistrationId: 'manualLeave',
        businessInstanceId: 'draft-1',
        instanceId: sessionId,
        runtimeInstanceId: sessionId,
      },
      turn: {
        turnId: 'turn-1',
        seq: 1,
        baseRevision: 0,
        queuedAt: '2026-05-14T00:00:00.000Z',
        startedAt: '2026-05-14T00:00:00.000Z',
        maxParallelTurns: 1,
      },
      systemPrompt: 'sys',
      tools: [],
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.text).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/sessions/manualLeave%3Adraft-1/turn/stream')
    expect(JSON.parse(init.body as string)).toMatchObject({
      scope: {
        moduleId: 'manualLeave',
        moduleInstanceId: 'draft-1',
        instanceId: sessionId,
      },
      messages: [{ role: 'user', content: 'hello' }],
    })
  })
})
