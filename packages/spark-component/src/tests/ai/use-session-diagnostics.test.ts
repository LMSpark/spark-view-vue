import { describe, it, expect } from 'vitest'
import { useSessionDiagnostics } from '../../ai/composables/useSessionDiagnostics'
import type { AiAgentSessionRecord } from '@spark-view/spark-ai/agent'
import { ref } from 'vue'

const BASE = {
  moduleId: 'mod-1',
  moduleInstanceId: 'mod-inst-1',
  instanceId: 'inst-1',
  runtimeInstanceId: 'rt-1',
}

function makeSessionRecord(overrides: Partial<AiAgentSessionRecord> = {}): AiAgentSessionRecord {
  return {
    ...BASE,
    status: 'Completed',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    history: [],
    ...overrides,
  } as unknown as AiAgentSessionRecord
}

function makeFailedCallEntry(overrides: Record<string, unknown> = {}) {
  return {
    ...BASE,
    kind: 'functionCall',
    seq: 1,
    id: 'fc-1',
    timestamp: Date.now(),
    toolName: 'testTool',
    args: {},
    status: 'failed',
    error: { ok: false, code: 'ERR', msg: 'boom', fix: 'try again' },
    ...overrides,
  }
}

function makeMessageEntry(overrides: Record<string, unknown> = {}) {
  return {
    ...BASE,
    kind: 'message' as const,
    seq: 1,
    id: 'm1',
    timestamp: Date.now(),
    role: 'user' as const,
    source: 'ui' as const,
    content: 'hello',
    ...overrides,
  }
}

describe('useSessionDiagnostics', () => {
  it('正常 sessionRecord → 生成 summary/transcript', () => {
    const record = makeSessionRecord()
    const sessionRef = ref<AiAgentSessionRecord | null>(record)
    const { data } = useSessionDiagnostics({ sessionRecord: () => sessionRef.value })

    expect(data.value.summary).toBeDefined()
    expect(data.value.summary.historyCount).toBe(0)
    expect(data.value.transcript).toEqual([])
    expect(data.value.issues).toEqual([])
  })

  it('null sessionRecord → 返回空摘要（非 null）', () => {
    const sessionRef = ref<AiAgentSessionRecord | null>(null)
    const { data } = useSessionDiagnostics({ sessionRecord: () => sessionRef.value })

    expect(data.value.summary).toBeDefined()
    expect(data.value.summary.status).toBeNull()
    expect(data.value.summary.historyCount).toBe(0)
    expect(data.value.summary.messageCount).toBe(0)
    expect(data.value.transcript).toEqual([])
    expect(data.value.issues).toEqual([])
  })

  it('失败 functionCall → issue 列表包含对应条目', () => {
    const record = makeSessionRecord({
      history: [makeFailedCallEntry()],
    } as Partial<AiAgentSessionRecord>)

    const sessionRef = ref<AiAgentSessionRecord | null>(record)
    const { data } = useSessionDiagnostics({ sessionRecord: () => sessionRef.value })

    expect(data.value.issues).toHaveLength(1)
    const issue = data.value.issues[0]
    expect(issue?.level).toBe('error')
    expect(issue?.message).toContain('testTool')
  })

  it('失败 functionCall 的 error 信息可读（不是 [object Object]）', () => {
    const record = makeSessionRecord({
      history: [makeFailedCallEntry({
        error: { ok: false, code: 'TIMEOUT', msg: 'tool timed out', fix: 'increase timeout' },
      })],
    } as Partial<AiAgentSessionRecord>)

    const sessionRef = ref<AiAgentSessionRecord | null>(record)
    const { data } = useSessionDiagnostics({ sessionRecord: () => sessionRef.value })

    const message = data.value.issues[0]?.message ?? ''
    expect(message).not.toContain('[object Object]')
    expect(message).toContain('tool timed out')
  })

  it('sessionRecord 更新后 computed 自动重算', () => {
    const sessionRef = ref<AiAgentSessionRecord | null>(null)
    const { data } = useSessionDiagnostics({ sessionRecord: () => sessionRef.value })

    expect(data.value.summary.historyCount).toBe(0)

    sessionRef.value = makeSessionRecord({
      history: [
        makeMessageEntry({ role: 'user', content: 'hello' }),
        makeMessageEntry({ seq: 2, id: 'm2', role: 'assistant', source: 'llm', content: 'hi' }),
      ],
    } as Partial<AiAgentSessionRecord>)

    expect(data.value.summary.historyCount).toBe(2)
    expect(data.value.summary.messageCount).toBe(2)
  })
})
