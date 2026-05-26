import { describe, expect, it } from 'vitest'

import {
  createAiHostSessionTranscript,
  summarizeAiHostSessionRecord,
  type AiHostSessionRecord,
} from '../host'

// ── Fixture ─────────────────────────────────────────────────

function sessionRecord(): AiHostSessionRecord {
  return {
    moduleId: 'pageDesign',
    moduleInstanceId: 'page-a',
    instanceId: 'page-a',
    runtimeInstanceId: 'page-a',
    status: 'Started',
    startedAt: 1000,
    updatedAt: 3000,
    history: [
      {
        kind: 'message',
        moduleId: 'pageDesign',
        moduleInstanceId: 'page-a',
        instanceId: 'page-a',
        runtimeInstanceId: 'page-a',
        id: 'm1',
        seq: 1,
        timestamp: 1000,
        role: 'user',
        source: 'ui',
        content: '设计页面',
      },
      {
        kind: 'functionCall',
        moduleId: 'pageDesign',
        moduleInstanceId: 'page-a',
        instanceId: 'page-a',
        runtimeInstanceId: 'page-a',
        id: 'f1',
        seq: 2,
        timestamp: 2000,
        toolName: 'pageDesign_payload-catalog_guidePayload',
        args: { $paths: ['page-a', 'page-a'] },
        status: 'failed',
        error: { ok: false, code: 'BAD', msg: 'bad args', fix: 'fix args' },
      },
      {
        kind: 'message',
        moduleId: 'pageDesign',
        moduleInstanceId: 'page-a',
        instanceId: 'page-a',
        runtimeInstanceId: 'page-a',
        id: 'm2',
        seq: 3,
        timestamp: 3000,
        role: 'assistant',
        source: 'llm',
        content: '已完成',
      },
    ],
  }
}

// ── Assertions ──────────────────────────────────────────────

describe('session diagnostics', () => {
  it('summarizes session history without business assumptions', () => {
    expect(summarizeAiHostSessionRecord(sessionRecord())).toMatchObject({
      status: 'Started',
      historyCount: 3,
      messageCount: 2,
      toolCallCount: 1,
      failedToolCallCount: 1,
      actionNames: ['pageDesign_payload-catalog_guidePayload'],
      lastAssistantText: '已完成',
    })
  })

  it('creates a bounded transcript', () => {
    const transcript = createAiHostSessionTranscript(sessionRecord(), { contentLimit: 3 })

    expect(transcript).toHaveLength(3)
    expect(transcript[0]).toMatchObject({ direction: 'USER => AGENT', content: expect.stringContaining('...<truncated') })
    expect(transcript[1]).toMatchObject({ direction: 'AGENT TOOL => LLM', toolName: 'pageDesign_payload-catalog_guidePayload' })
    expect(transcript[2]).toMatchObject({ direction: 'LLM => AGENT', content: '已完成' })
  })
})
