import { describe, expect, it, vi } from 'vitest'
import {
  createScenarioSseLlmClient,
  type AiScenarioSseEventEnvelope,
  type ScenarioSseFetch,
} from '../index'

/**
 * ==============================================
 * 回归测试：scenario SSE LLM client
 * ==============================================
 * 功能分区：
 * 1) 验证旧 /api/ai/sessions/{sessionId}/turn/stream 的 result/done 解析。
 * 2) 验证通用 chat stream 的 delta/reasoning 聚合。
 * 3) 验证未来统一信封 type/payload/sessionId 解析。
 * 4) 验证自定义 streamUrlBuilder、requestBodyBuilder、headers 与 credentials。
 * 5) 验证 error 事件会 fail-fast。
 *
 * 时序分区：
 * 1) 构造内存 ReadableStream 模拟 SSE。
 * 2) 注入 fetchImpl，避免真实网络调用。
 * 3) 调用 client.generate。
 * 4) 校验最终 text、raw events 与请求参数。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：测试用 SSE 与 fetch 构造器
// ═══════════════════════════════════════════════════════════════════════════

interface ScenarioSseRawPayload {
  session?: { sessionId: string }
  events?: readonly AiScenarioSseEventEnvelope[]
  reasoning?: string
}

function createSseResponse(content: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(content))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function createSseFetchMock(content: string): ReturnType<typeof vi.fn<ScenarioSseFetch>> {
  return vi.fn<ScenarioSseFetch>(async () => createSseResponse(content))
}

function readRawPayload(raw: unknown): ScenarioSseRawPayload {
  expect(typeof raw).toBe('object')
  expect(raw).not.toBeNull()
  return raw as ScenarioSseRawPayload
}

describe('scenario SSE LLM client', () => {
  /**
   * 用例 1：兼容旧 session turn SSE。
   * result 事件是最终答案来源，done 负责结束流。
   */
  it('reads result event from default session turn stream', async () => {
    // 阶段 1：准备旧后端格式的 result/done 流
    const fetchMock = createSseFetchMock([
      'event: result',
      'data: {"text":"final answer","reasoning":"checked"}',
      '',
      'event: done',
      'data: {}',
      '',
    ].join('\n'))
    const onEvent = vi.fn()

    // 阶段 2：创建固定 sessionId 客户端并发起 generate
    const client = createScenarioSseLlmClient({
      sessionId: 'session-1',
      getHeaders: () => ({ 'X-Project': 'project-1' }),
      fetchImpl: fetchMock,
      onEvent,
    })
    const result = await client.generate({ messages: [{ role: 'user', content: 'hello' }] })

    // 阶段 3：断言默认 URL、请求头与最终文本
    expect(result.text).toBe('final answer')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ai/sessions/session-1/turn/stream')
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeUndefined()
    expect(init?.headers).toMatchObject({
      Accept: 'text/event-stream',
      'X-Project': 'project-1',
    })
    expect(onEvent).toHaveBeenCalledTimes(2)

    // 阶段 4：断言 raw 中保留归一化事件
    const raw = readRawPayload(result.raw)
    expect(raw.events?.map((event) => event.type)).toEqual(['result', 'done'])
    expect(raw.events?.[0]?.payload).toEqual({ text: 'final answer', reasoning: 'checked' })
  })

  /**
   * 用例 2：兼容通用 chat stream。
   * 该流没有 result 事件，因此以 delta 聚合文本作为 generate.text。
   */
  it('aggregates delta events when result event is absent', async () => {
    // 阶段 1：准备 delta/reasoning/done 流
    const fetchMock = createSseFetchMock([
      'event: delta',
      'data: Hello ',
      '',
      'event: reasoning',
      'data: {"reasoning":"thinking"}',
      '',
      'event: delta',
      'data: {"delta":"world"}',
      '',
      'event: done',
      'data: {"done":true}',
      '',
    ].join('\n'))

    // 阶段 2：使用 getSessionId 模拟多会话前端当前会话切换
    const client = createScenarioSseLlmClient({
      getSessionId: () => 'session-2',
      fetchImpl: fetchMock,
    })
    const result = await client.generate({ messages: [{ role: 'user', content: 'stream' }] })

    // 阶段 3：断言 delta 与 reasoning 聚合
    expect(result.text).toBe('Hello world')
    const raw = readRawPayload(result.raw)
    expect(raw.session?.sessionId).toBe('session-2')
    expect(raw.reasoning).toBe('thinking')
    expect(raw.events?.map((event) => event.type)).toEqual(['delta', 'reasoning', 'delta', 'done'])
  })

  /**
   * 用例 3：兼容未来统一事件信封。
   * 当 SSE event 为 message 时，应以 data.type 作为真实事件类型。
   */
  it('normalizes future envelope event with type and payload fields', async () => {
    // 阶段 1：准备统一信封格式流
    const fetchMock = createSseFetchMock([
      'event: message',
      'data: {"type":"result","sessionId":"session-env","requestId":"request-1","payload":{"text":"from envelope"}}',
      '',
      'event: message',
      'data: {"type":"done","payload":{"done":true}}',
      '',
    ].join('\n'))
    const onEvent = vi.fn()

    // 阶段 2：resolveSession 返回完整会话上下文与 streamUrl
    const client = createScenarioSseLlmClient({
      resolveSession: () => ({
        sessionId: 'session-env',
        turnId: 'turn-1',
        streamUrl: '/ai-framework/session-env/stream',
      }),
      fetchImpl: fetchMock,
      onEvent,
    })
    const result = await client.generate({ messages: [{ role: 'user', content: 'future' }] })

    // 阶段 3：断言信封字段被归一化
    expect(result.text).toBe('from envelope')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ai-framework/session-env/stream')
    const firstEvent = onEvent.mock.calls[0]?.[0] as AiScenarioSseEventEnvelope | undefined
    expect(firstEvent).toMatchObject({
      type: 'result',
      sessionId: 'session-env',
      requestId: 'request-1',
      turnId: 'turn-1',
      payload: { text: 'from envelope' },
    })
  })

  /**
   * 用例 4：自定义 AI 框架 endpoint。
   * 未来框架可通过 URL/body builder 控制请求形态，前端仍只传 session 信息。
   */
  it('uses custom streamUrlBuilder, requestBodyBuilder, headers and credentials', async () => {
    // 阶段 1：准备最小 result/done 流
    const fetchMock = createSseFetchMock([
      'event: result',
      'data: {"text":"custom ok"}',
      '',
      'event: done',
      'data: {}',
      '',
    ].join('\n'))

    // 阶段 2：创建自定义 endpoint 客户端
    const client = createScenarioSseLlmClient({
      sessionId: 'session-custom',
      streamUrlBuilder: (session) => `/ai-framework/${session.sessionId}/turn`,
      requestBodyBuilder: (request, session) => ({
        sessionId: session.sessionId,
        messages: request.messages,
      }),
      headers: { 'X-Static': 'yes' },
      credentials: 'include',
      fetchImpl: fetchMock,
    })
    const result = await client.generate({ messages: [{ role: 'user', content: 'custom' }] })

    // 阶段 3：断言请求形态与结果
    expect(result.text).toBe('custom ok')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/ai-framework/session-custom/turn')
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.credentials).toBe('include')
    expect(init?.headers).toMatchObject({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      'X-Static': 'yes',
    })
    expect(init?.body).toBe('{"sessionId":"session-custom","messages":[{"role":"user","content":"custom"}]}')
  })

  /**
   * 用例 5：SSE error fail-fast。
   * error 事件不能静默吞掉，否则上层会误以为空回复。
   */
  it('throws when stream emits error event', async () => {
    // 阶段 1：准备 error/done 流
    const fetchMock = createSseFetchMock([
      'event: error',
      'data: {"error":{"message":"provider failed"}}',
      '',
      'event: done',
      'data: {}',
      '',
    ].join('\n'))

    // 阶段 2：执行 generate 并断言显式失败
    const client = createScenarioSseLlmClient({ sessionId: 'session-error', fetchImpl: fetchMock })
    await expect(client.generate({ messages: [{ role: 'user', content: 'fail' }] })).rejects.toThrow(
      'Scenario SSE error: provider failed',
    )
  })

  /**
   * 用例 6：缺少会话 ID fail-fast。
   * 前端不创建会话，但必须提供当前会话标识或解析器。
   */
  it('fails fast when no session resolver is configured', async () => {
    // 阶段 1：创建缺少 session 配置的客户端
    const client = createScenarioSseLlmClient({ fetchImpl: createSseFetchMock('') })

    // 阶段 2：执行 generate 时立即失败，不发起网络请求
    await expect(client.generate({ messages: [{ role: 'user', content: 'missing session' }] })).rejects.toThrow(
      'Scenario SSE LLM client requires sessionId, getSessionId, or resolveSession.',
    )
  })
})
