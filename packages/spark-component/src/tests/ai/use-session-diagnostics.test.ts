import { describe, it, expect } from 'vitest'
import { useSessionDiagnostics } from '../../ai/composables/useSessionDiagnostics'
import type {
  AiAgentSessionRecord,
  AiAgentFunctionCallHistoryEntry,
  AiAgentMessageHistoryEntry,
  AiAgentHistoryEntry,
  AiAgentFunctionCallFailure,
} from '@spark-view/spark-ai/agent'
import { ref } from 'vue'

const BASE = {
  moduleId: 'mod-1',
  moduleInstanceId: 'mod-inst-1',
  instanceId: 'inst-1',
  runtimeInstanceId: 'rt-1',
}

type SessionRecordOptions = Readonly<{
  moduleId?: string
  moduleInstanceId?: string
  instanceId?: string
  runtimeInstanceId?: string
  status?: AiAgentSessionRecord['status']
  startedAt?: number
  updatedAt?: number
  stoppedAt?: number
  reason?: string
  history?: readonly AiAgentHistoryEntry[]
}>

function makeSessionRecord(options: SessionRecordOptions = {}): AiAgentSessionRecord {
  const defaults = {
    moduleId: BASE.moduleId,
    moduleInstanceId: BASE.moduleInstanceId,
    instanceId: BASE.instanceId,
    runtimeInstanceId: BASE.runtimeInstanceId,
    status: 'Started' as const,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    history: [] as const,
  }
  return { ...defaults, ...options }
}

type FailedCallEntryOptions = Readonly<{
  kind?: 'functionCall'
  seq?: number
  id?: string
  timestamp?: number
  toolName?: string
  args?: unknown
  status?: AiAgentFunctionCallHistoryEntry['status']
  error?: AiAgentFunctionCallFailure
}>

function makeFailedCallEntry(options: FailedCallEntryOptions = {}): AiAgentFunctionCallHistoryEntry {
  const defaults = {
    ...BASE,
    kind: 'functionCall' as const,
    seq: 1,
    id: 'fc-1',
    timestamp: Date.now(),
    toolName: 'testTool',
    args: {} satisfies unknown,
    status: 'failed' as const,
    error: { ok: false as const, code: 'ERR', msg: 'boom', fix: 'try again' },
  }
  return { ...defaults, ...options }
}

type MessageEntryOptions = Readonly<{
  kind?: 'message'
  seq?: number
  id?: string
  timestamp?: number
  role?: AiAgentMessageHistoryEntry['role']
  source?: AiAgentMessageHistoryEntry['source']
  content?: string
}>

function makeMessageEntry(options: MessageEntryOptions = {}): AiAgentMessageHistoryEntry {
  const defaults = {
    ...BASE,
    kind: 'message' as const,
    seq: 1,
    id: 'm1',
    timestamp: Date.now(),
    role: 'user' as const,
    source: 'ui' as const,
    content: 'hello',
  }
  return { ...defaults, ...options }
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
    })

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
    })

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
    })

    expect(data.value.summary.historyCount).toBe(2)
    expect(data.value.summary.messageCount).toBe(2)
  })
})
