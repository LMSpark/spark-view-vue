/**
 * 会话后端 HTTP 客户端统一实现。
 *
 * - SessionBackendImpl：运行时 AI 会话客户端（基于 createRequest）
 */

import { createFetchClient, createRequest, Logger } from '@spark-view/spark-utils'
import type {
  SessionBackend,
  LlmResponse,
  SessionBackendSseEvent,
  ToolCall,
  ToolDefinition,
} from '../protocol/session-contracts'

const log = Logger('SessionBackend')

/**
 * 会话后端实现选项接口
 */
export interface SessionBackendImplOptions {
  /**
   * 获取请求头的函数
   * 用于在请求中添加认证、租户等信息
   */
  getHeaders?: () => Record<string, string>
  
  /**
   * SSE事件回调函数
   * 用于处理从服务器发送的事件
   */
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
}

/**
 * 提取后端错误的可读摘要，避免上层只拿到"Network Error/null"这类弱信息。
 */
function toBackendErrorMessage(err: unknown): string {
  const fallback = err instanceof Error ? err.message : String(err)
  if (typeof err !== 'object' || err === null) {
    return fallback
  }
  const e = err as {
    message?: string
    status?: number
    code?: string
    response?: unknown
  }

  const status = typeof e.status === 'number' ? `HTTP ${e.status}` : ''
  const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : ''

  const response = e.response
  if (typeof response === 'object' && response !== null) {
    const resp = e.response as {
      error?: { code?: string; message?: string; category?: string }
      state?: string
      stateTransition?: string
    }
    const errorCode = resp.error?.code ?? ''
    const errorMsg = resp.error?.message ?? ''
    const category = resp.error?.category ?? ''
    const state = typeof resp.state === 'string' ? resp.state : ''
    const stateTransition = typeof resp.stateTransition === 'string' ? resp.stateTransition : ''

    const parts = [
      status,
      code,
      errorCode,
      category,
      errorMsg,
      state ? `state=${state}` : '',
      stateTransition ? `transition=${stateTransition}` : '',
    ].filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }
  }

  return [status, code, e.message ?? fallback].filter(Boolean).join(' | ') || fallback
}

/**
 * 会话后端实现类
 * 管理与AI后端服务的通信，包括会话创建、执行、消息追加和销毁
 */
export class SessionBackendImpl implements SessionBackend {
  private http = createRequest({ timeout: 300_000 })
  private sseClient = createFetchClient({ timeout: 300_000 })
  private sessionIds = new Set<string>()
  private baseUrl: string
  private readonly getHeaders: (() => Record<string, string>) | null
  private readonly onSseEvent: ((event: { sessionId: string; type: string; data: string }) => void) | null

  /**
   * 构造函数
   * @param baseUrl 会话API的基础URL，默认为 '/api/ai/sessions'
   * @param options 实现选项，包括请求头和SSE事件回调
   */
  constructor(
    baseUrl = '/api/ai/sessions',
    options: SessionBackendImplOptions = {},
  ) {
    this.baseUrl = baseUrl
    this.getHeaders = options.getHeaders ?? null
    this.onSseEvent = options.onSseEvent ?? null

    this.http.interceptors.request.use({
      onRequest: (config) => {
        if (this.getHeaders) {
          config.headers = { ...config.headers, ...this.getHeaders() }
        }
        return config
      },
    })
  }

  /**
   * 创建新的会话
   * @param systemPrompt 系统提示词
   * @param userPrompt 用户初始提示词
   * @param windowSize 对话窗口大小
   * @param tools 可用的工具定义
   * @param signal 取消信号
   * @returns 会话ID
   */
  async createSession(
    systemPrompt: string,
    userPrompt: string,
    windowSize: number,
    tools?: ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<string> {
    const resp = await this.http.post<{ sessionId: string }>(`${this.baseUrl}`, {
      protocolVersion: 3,
      systemPrompt,
      userPrompt,
      windowSize,
      mode: 'functions',
      tools: tools ?? null,
    }, signal ? { signal } : undefined)

    const sessionId = resp.sessionId
    this.sessionIds.add(sessionId)
    return sessionId
  }

  /**
   * 执行单轮对话
   * @param sessionId 会话ID
   * @param options 执行选项，包括取消信号和SSE事件回调
   * @returns LLM响应或null（如果失败）
   */
  async executeTurn(
    sessionId: string,
    options: { signal?: AbortSignal; onSseEvent?: (event: SessionBackendSseEvent) => void } = {},
  ): Promise<LlmResponse | null> {
    try {
      return await this.executeTurnViaSse(sessionId, options)
    } catch (err) {
      const detail = toBackendErrorMessage(err)
      log.error('executeTurn failed:', detail, err)
      throw new Error(`会话轮次调用失败: ${detail}`)
    }
  }

  /**
   * 通过SSE执行单轮对话
   * @param sessionId 会话ID
   * @param options 执行选项
   * @returns LLM响应
   */
  private async executeTurnViaSse(
    sessionId: string,
    options: { signal?: AbortSignal; onSseEvent?: (event: SessionBackendSseEvent) => void } = {},
  ): Promise<LlmResponse> {
    const headers: Record<string, string> = this.getHeaders ? this.getHeaders() : {}
    const events = await this.sseClient.streamSSE({
      url: `${this.baseUrl}/${sessionId}/turn/stream`,
      method: 'POST',
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
    })
    const onSseEvent = options.onSseEvent ?? this.onSseEvent

    let finalResult: LlmResponse | null = null
    let streamError = ''

    // 遍历SSE事件流
    for await (const event of events) {
      const eventType = event.event ?? 'message'
      const data = event.data

      if (onSseEvent) {
        onSseEvent({
          sessionId,
          type: eventType,
          data,
        })
      }

      if (!data && eventType !== 'done') continue

      // 处理结果事件
      if (eventType === 'result') {
        try {
          const parsed = JSON.parse(data) as {
            text?: string
            reasoning?: string
            toolCalls?: ToolCall[]
          }
          finalResult = {
            text: parsed.text ?? '',
            ...(parsed.reasoning !== undefined ? { reasoning: parsed.reasoning } : {}),
            ...(parsed.toolCalls !== undefined ? { toolCalls: parsed.toolCalls } : {}),
          }
        } catch {
          finalResult = { text: data }
        }
      }

      // 处理错误事件
      if (eventType === 'error') {
        streamError = data
      }

      // 处理完成事件
      if (eventType === 'done') {
        break
      }
    }

    if (streamError) {
      throw new Error(`SSE error: ${streamError}`)
    }

    if (finalResult === null) {
      throw new Error('SSE 未返回 result 事件')
    }

    return finalResult
  }

  /**
   * 向会话追加消息
   * @param sessionId 会话ID
   * @param messages 要追加的消息列表
   * @param signal 取消信号
   */
  async appendMessages(
    sessionId: string,
    messages: Array<{
      role: string
      content: string
      tool_call_id?: string
      tool_calls?: ToolCall[]
    }>,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.http.post(`${this.baseUrl}/${sessionId}/append`, {
      protocolVersion: 3,
      messages,
    }, signal ? { signal } : undefined)
  }

  /**
   * 获取会话的完整对话记录
   * @param sessionId 会话ID
   * @returns 对话记录数组
   */
  async getConversation(
    sessionId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const resp = await this.http.get<{ conversation: Array<{ role: string; content: string }> }>(
      `${this.baseUrl}/${sessionId}/conversation`
    )

    return resp.conversation
  }

  /**
   * 销毁指定会话
   * @param sessionId 会话ID
   */
  async destroySession(sessionId: string): Promise<void> {
    await this.http.delete(`${this.baseUrl}/${sessionId}`)
    this.sessionIds.delete(sessionId)
  }

  /**
   * 销毁所有会话
   */
  async destroyAllSessions(): Promise<void> {
    const ids = Array.from(this.sessionIds)
    for (const sessionId of ids) {
      await this.http.delete(`${this.baseUrl}/${sessionId}`)
    }
    this.sessionIds.clear()
  }
}

/**
 * 创建会话后端实例的工厂函数
 * @param baseUrl 会话API的基础URL
 * @param options 实现选项
 * @returns 会话后端实例
 */
export function createSessionBackend(
  baseUrl?: string,
  options: SessionBackendImplOptions = {},
): SessionBackend {
  return new SessionBackendImpl(baseUrl, options)
}