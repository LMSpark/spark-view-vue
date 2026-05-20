import { describe, expect, it, vi } from 'vitest'

import type {
  AiHostAppendMessagesInput,
  AiHostBusinessScope,
  AiHostStreamTurnInput,
  AiHostStreamTurnResult,
  AiHostTransport,
  AiHostTurnMeta,
} from '@spark-view/spark-ai/host'
import {
  AppAiHost,
  createAppAiHost,
} from '../ai/app-ai-host'

function createScope(): AiHostBusinessScope {
  return {
    businessRegistrationId: 'pageDesign',
    businessInstanceId: 'page-1',
    instanceId: 'session-1',
    runtimeInstanceId: 'runtime-1',
  }
}

function createTurn(): AiHostTurnMeta {
  return {
    turnId: 'turn-1',
    seq: 1,
    baseRevision: 0,
    queuedAt: '2026-05-20T00:00:00.000Z',
    startedAt: '2026-05-20T00:00:01.000Z',
    maxParallelTurns: 1,
  }
}

function createStreamTurnInput(): AiHostStreamTurnInput {
  return {
    sessionId: 'session-1',
    scope: createScope(),
    turn: createTurn(),
    systemPrompt: 'system prompt',
    tools: [],
    messages: [
      {
        role: 'user',
        content: 'hello',
      },
    ],
  }
}

function createAppendMessagesInput(): AiHostAppendMessagesInput {
  return {
    sessionId: 'session-1',
    scope: createScope(),
    turn: createTurn(),
    messages: [
      {
        role: 'assistant',
        content: 'done',
      },
    ],
  }
}

function createTransport() {
  const streamTurn = vi.fn<(input: AiHostStreamTurnInput) => Promise<AiHostStreamTurnResult>>()
  const appendMessages = vi.fn<(input: AiHostAppendMessagesInput) => Promise<void>>()
  const transport: AiHostTransport = {
    streamTurn,
    appendMessages,
  }
  return {
    transport,
    streamTurn,
    appendMessages,
  }
}

describe('app-ai-host', () => {
  it('delegates streamTurn and appendMessages to the injected transport', async () => {
    const { transport, streamTurn, appendMessages } = createTransport()
    const host = new AppAiHost({ transport })
    const streamInput = createStreamTurnInput()
    const appendInput = createAppendMessagesInput()
    const streamResult: AiHostStreamTurnResult = {
      text: 'assistant reply',
      toolCalls: [],
    }

    streamTurn.mockResolvedValue(streamResult)
    appendMessages.mockResolvedValue(undefined)

    await expect(host.streamTurn(streamInput)).resolves.toEqual(streamResult)
    await expect(host.appendMessages(appendInput)).resolves.toBeUndefined()
    expect(streamTurn).toHaveBeenCalledWith(streamInput)
    expect(appendMessages).toHaveBeenCalledWith(appendInput)
    expect(host.transport).toBe(transport)
  })

  it('createAppAiHost preserves the caller-provided transport instance', () => {
    const { transport } = createTransport()
    const host = createAppAiHost({ transport })

    expect(host).toBeInstanceOf(AppAiHost)
    expect(host.transport).toBe(transport)
  })
})