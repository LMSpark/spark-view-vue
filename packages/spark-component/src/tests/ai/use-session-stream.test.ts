import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSessionStream } from '../../ai/composables/useSessionStream'
import type { AiAgentStreamEvent, AiAgentToolCallRecord } from '@spark-view/spark-ai/agent'
import type { AiAgentFunctionCallResult } from '@spark-view/spark-ai/agent'

vi.mock('@spark-view/spark-ai/agent', async () => {
  const actual = await vi.importActual('@spark-view/spark-ai/agent')
  return {
    ...actual,
    previewAiAgentDiagnosticValue: (value: unknown, limit: number): string => {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      if (text.length <= limit) return text
      return `${text.slice(0, limit)}...<truncated>`
    },
  }
})

type StreamEventOptions = Readonly<{
  type?: string
  data?: unknown
  turnKey?: string
  streamKey?: string
  scope?: AiAgentStreamEvent['scope']
}>

function makeStreamEvent(options: StreamEventOptions = {}): AiAgentStreamEvent {
  const defaults = {
    type: 'delta',
    data: 'hello',
    turnKey: 'kind::instance-1::turn-1',
    streamKey: 'kind::instance-1::turn-1::stream-1',
    scope: {
      businessRegistrationId: 'reg-1',
      businessInstanceId: 'instance-1',
      eventModuleId: 'module-1',
      turnId: 'turn-1',
    },
  }
  return { ...defaults, ...options }
}

type ToolCallRecordOptions = Readonly<{
  toolName?: string
  args?: unknown
  turnId?: string
  round?: number
  callId?: string
  status?: 'success' | 'error'
  result?: AiAgentFunctionCallResult<unknown>
  durationMs?: number
}>

function makeToolCallRecord(options: ToolCallRecordOptions = {}): AiAgentToolCallRecord {
  const defaults = {
    toolName: 'testTool',
    args: { key: 'value' },
    turnId: 'turn-1',
    round: 1,
    callId: 'call-1',
    status: 'success' as const,
    result: { ok: true as const, data: 'done' },
    durationMs: 150,
  }
  return { ...defaults, ...options }
}

describe('useSessionStream', () => {
  let stream: ReturnType<typeof useSessionStream>

  beforeEach(() => {
    stream = useSessionStream()
  })

  // ── appendEvent 记录 activeTurnId ──

  it('appendEvent 记录 activeTurnId，后续 appendDelta 归入正确 turn', () => {
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('Hello world')

    expect(stream.entries.value).toHaveLength(1)
    const entry = stream.entries.value[0]
    expect(entry?.kind).toBe('assistant-delta')
    if (entry?.kind === 'assistant-delta') {
      expect(entry.content).toBe('Hello world')
      expect(entry.turnId).toBe('turn-1')
    }
  })

  it('onStreamEvent 先到、onDelta 后到时，delta 能归入正确 turn', () => {
    stream.appendEvent(makeStreamEvent({ type: 'llm-request' }))
    stream.appendDelta('first chunk')

    expect(stream.entries.value).toHaveLength(1)
    const entry = stream.entries.value[0]
    if (entry?.kind === 'assistant-delta') {
      expect(entry.turnId).toBe('turn-1')
      expect(entry.content).toBe('first chunk')
    }
  })

  // ── delta/reasoning 交错合并 ──

  it('delta 和 reasoning 交错出现时，同 turnId 的同类条目正确合并', () => {
    stream.appendEvent(makeStreamEvent({ type: 'reasoning' }))
    stream.appendReasoning('thinking step 1...')

    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('Hello ')

    stream.appendEvent(makeStreamEvent({ type: 'reasoning' }))
    stream.appendReasoning('thinking step 2...')

    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('world')

    expect(stream.entries.value).toHaveLength(2)

    const r = stream.entries.value[0]
    if (r?.kind === 'reasoning') {
      expect(r.item.text).toBe('thinking step 1...thinking step 2...')
    }

    const d = stream.entries.value[1]
    if (d?.kind === 'assistant-delta') {
      expect(d.content).toBe('Hello world')
    }
  })

  // ── 顺序 turn 切换 ──

  it('顺序 turn 切换——第二个 appendEvent 切换 activeTurnId，delta 归入新 turn', () => {
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('turn-1 text')

    stream.appendEvent(makeStreamEvent({
      type: 'result',
      scope: { ...makeStreamEvent().scope, turnId: 'turn-1' },
    }))

    stream.appendEvent(makeStreamEvent({
      type: 'delta',
      scope: { ...makeStreamEvent().scope, turnId: 'turn-2' },
    }))
    stream.appendDelta('turn-2 text')

    expect(stream.entries.value.length).toBeGreaterThanOrEqual(2)
  })

  // ── 无活跃 turn → 协议错误 ──

  it('无活跃 turn 时调用 appendDelta → 追加 kind=error 协议错误条目', () => {
    stream.appendDelta('orphan delta')

    expect(stream.entries.value).toHaveLength(1)
    const entry = stream.entries.value[0]
    expect(entry?.kind).toBe('error')
    if (entry?.kind === 'error') {
      expect(entry.message).toContain('Received AI delta before any turn event')
    }
  })

  it('无活跃 turn 时调用 appendReasoning → 追加 kind=error 协议错误条目', () => {
    stream.appendReasoning('orphan reasoning')

    expect(stream.entries.value).toHaveLength(1)
    const entry = stream.entries.value[0]
    expect(entry?.kind).toBe('error')
    if (entry?.kind === 'error') {
      expect(entry.message).toContain('Received AI reasoning before any turn event')
    }
  })

  // ── finalizeCurrentTurn 收尾 ──

  it('appendReasoning + finalizeCurrentTurn → reasoning 折叠', () => {
    stream.appendEvent(makeStreamEvent({ type: 'reasoning' }))
    stream.appendReasoning('deep thinking...')

    stream.appendEvent(makeStreamEvent({
      type: 'result',
      scope: { ...makeStreamEvent().scope, turnId: 'turn-1' },
    }))

    const reasoningEntry = stream.entries.value.find((e) => e.kind === 'reasoning')
    if (reasoningEntry?.kind === 'reasoning') {
      expect(reasoningEntry.item.collapsed).toBe(true)
    }
  })

  // ── appendToolCall ──

  it('appendToolCall → 条目追加，argsPreview/resultSummary 为截断后的字符串', () => {
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendToolCall(makeToolCallRecord())

    expect(stream.toolCalls.value).toHaveLength(1)
    expect(stream.toolCalls.value[0]?.argsPreview).toBeTypeOf('string')
    expect(stream.toolCalls.value[0]?.resultSummary).toBeTypeOf('string')

    const entry = stream.entries.value.find((e) => e.kind === 'tool-call')
    expect(entry).toBeDefined()
  })

  // ── 长参数截断 ──

  it('appendToolCall 对超长 args 进行截断', () => {
    const longArgs = 'x'.repeat(500)
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendToolCall(makeToolCallRecord({ args: longArgs }))

    const item = stream.toolCalls.value[0]
    expect(item?.argsPreview.length).toBeLessThanOrEqual(200 + '...<truncated>'.length)
  })

  // ── markAborted ──

  it('markAborted 追加 system-message 并调用 finish 关闭 streaming', () => {
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('some text')

    stream.markAborted('本地已中断')

    expect(stream.isStreaming.value).toBe(false)
    expect(stream.isReasoning.value).toBe(false)
    const sysEntry = stream.entries.value.find((e) => e.kind === 'system-message')
    expect(sysEntry).toBeDefined()
    if (sysEntry?.kind === 'system-message') {
      expect(sysEntry.content).toBe('本地已中断')
    }
  })

  it('markAborted 无参数时使用默认文本', () => {
    stream.markAborted()

    const sysEntry = stream.entries.value.find((e) => e.kind === 'system-message')
    if (sysEntry?.kind === 'system-message') {
      expect(sysEntry.content).toBe('本地已中断')
    }
  })

  // ── finish ──

  it('finish 在活跃 turn 存在时 finalize 并关闭 streaming', () => {
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('final content')
    expect(stream.isStreaming.value).toBe(true)

    stream.finish()

    expect(stream.isStreaming.value).toBe(false)
    expect(stream.isReasoning.value).toBe(false)
  })

  it('finish 在无活跃 turn 时仅设置 streaming=false，不抛错', () => {
    expect(() => stream.finish()).not.toThrow()
    expect(stream.isStreaming.value).toBe(false)
    expect(stream.isReasoning.value).toBe(false)
  })

  // ── appendError ──

  it('appendError 关闭 streaming 并追加错误条目', () => {
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('partial...')
    stream.appendError('connection lost')

    expect(stream.isStreaming.value).toBe(false)
    const errEntry = stream.entries.value.find((e) => e.kind === 'error')
    expect(errEntry).toBeDefined()
  })

  // ── reset ──

  it('reset 清空所有状态', () => {
    stream.appendEvent(makeStreamEvent({ type: 'delta' }))
    stream.appendDelta('text')
    stream.appendUserMessage('user msg')

    stream.reset()

    expect(stream.entries.value).toHaveLength(0)
    expect(stream.toolCalls.value).toHaveLength(0)
    expect(stream.streamText.value).toBe('')
    expect(stream.reasoningText.value).toBe('')
    expect(stream.isStreaming.value).toBe(false)
    expect(stream.isReasoning.value).toBe(false)
  })

  // ── appendUserMessage ──

  it('appendUserMessage 追加用户消息条目', () => {
    stream.appendUserMessage('你好')

    expect(stream.entries.value).toHaveLength(1)
    const entry = stream.entries.value[0]
    expect(entry?.kind).toBe('user-message')
    if (entry?.kind === 'user-message') {
      expect(entry.content).toBe('你好')
      expect(entry.timestamp).toBeGreaterThan(0)
    }
  })

  // ── error data 安全读取 ──

  it('appendEvent error 分支遇到 data=undefined 不抛错并追加 error 条目', () => {
    expect(() => {
      stream.appendEvent(makeStreamEvent({
        type: 'error',
        data: undefined,
      }))
    }).not.toThrow()

    const errEntry = stream.entries.value.find((e) => e.kind === 'error')
    expect(errEntry).toBeDefined()
  })

  it('appendEvent error 分支遇到 data=null 不抛错', () => {
    expect(() => {
      stream.appendEvent(makeStreamEvent({
        type: 'error',
        data: null,
      }))
    }).not.toThrow()

    expect(stream.entries.value.some((e) => e.kind === 'error')).toBe(true)
  })

  it('appendEvent error 分支 data 为对象时读取 message 字段', () => {
    stream.appendEvent(makeStreamEvent({
      type: 'error',
      data: { message: 'custom error text' },
    }))

    const errEntry = stream.entries.value.find((e) => e.kind === 'error')
    if (errEntry?.kind === 'error') {
      expect(errEntry.message).toContain('custom error text')
    }
  })
})
