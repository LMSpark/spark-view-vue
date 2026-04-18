/**
 * SessionBackend 实现 — HTTP 客户端
 *
 * 实现 SessionBackend 接口，负责与后端 Stills 会话端点通信。
 *
 * 配置模式：
 * - 调用 configureSessionBackend({ getHeaders }) 注入认证头
 * - 通常由 configureAILoopHttp 统一调用，应用层无需单独配置
 */

import { createRequest } from '@spark-view/spark-utils'
import type { SessionBackend, LlmResponse } from './session-orchestrator'
import type { ToolDefinition, ToolCall } from '../tool-calling'

// ═══════════════════════════════════════════════════════════
// 配置入口
// ═══════════════════════════════════════════════════════════

let _getHeaders: (() => Record<string, string>) | null = null

/**
 * 配置 SessionBackend 的认证头获取器。
 * 通常由 configureAILoopHttp 统一调用。
 */
export function configureSessionBackend(options: {
  getHeaders?: () => Record<string, string>
}): void {
  if (options.getHeaders) {
    _getHeaders = options.getHeaders
  }
}

// ═══════════════════════════════════════════════════════════
// SessionBackendImpl
// ═══════════════════════════════════════════════════════════

/**
 * SessionBackend 的 HTTP 实现。
 *
 * 使用 spark-utils 的 createRequest 创建 HTTP 客户端，
 * 通过 configureSessionBackend 注入的 getHeaders 获取认证头。
 */
export class SessionBackendImpl implements SessionBackend {
  private http = createRequest({ timeout: 300_000 })
  private sessionIds = new Set<string>()
  private baseUrl: string

  constructor(baseUrl = '/api/stills') {
    this.baseUrl = baseUrl

    // 注入认证头拦截器
    this.http.interceptors.request.use({
      onRequest: (config) => {
        if (_getHeaders) {
          config.headers = { ...config.headers, ..._getHeaders() }
        }
        return config
      },
    })
  }

  /**
   * 创建会话（附带 tool definitions）。
   */
  async createSession(
    systemPrompt: string,
    userPrompt: string,
    windowSize: number,
    tools?: ToolDefinition[],
  ): Promise<string> {
    const resp = await this.http.post<{ sessionId: string }>(`${this.baseUrl}/session`, {
      systemPrompt,
      userPrompt,
      windowSize,
      tools: tools ?? null,
    })

    const sessionId = resp.sessionId
    this.sessionIds.add(sessionId)
    return sessionId
  }

  /**
   * 执行一轮 LLM 对话。
   */
  async executeTurn(sessionId: string): Promise<LlmResponse | null> {
    try {
      const resp = await this.http.post<{
        text: string
        reasoning?: string
        toolCalls?: ToolCall[]
      }>(`${this.baseUrl}/turn`, { sessionId })

      const result: LlmResponse = { text: resp.text }
      if (resp.reasoning !== undefined) result.reasoning = resp.reasoning
      if (resp.toolCalls !== undefined) result.toolCalls = resp.toolCalls
      return result
    } catch (err) {
      console.error('[SessionBackend] executeTurn failed:', err)
      return null
    }
  }

  /**
   * 向会话追加消息（批量）。
   */
  async appendMessages(
    sessionId: string,
    messages: Array<{
      role: string
      content: string
      tool_call_id?: string
      tool_calls?: ToolCall[]
    }>,
  ): Promise<void> {
    await this.http.post(`${this.baseUrl}/append-batch`, {
      sessionId,
      messages,
    })
  }

  /**
   * 获取完整对话记录。
   */
  async getConversation(
    sessionId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const resp = await this.http.post<{
      conversation: Array<{ role: string; content: string }>
    }>(`${this.baseUrl}/conversation`, { sessionId })

    return resp.conversation
  }

  /**
   * 销毁单个会话。
   */
  async destroySession(sessionId: string): Promise<void> {
    await this.http.post(`${this.baseUrl}/destroy`, { sessionId })
    this.sessionIds.delete(sessionId)
  }

  /**
   * 销毁当前客户端创建的所有会话。
   */
  async destroyAllSessions(): Promise<void> {
    const ids = Array.from(this.sessionIds)
    if (ids.length > 0) {
      await this.http.post(`${this.baseUrl}/destroy-batch`, { sessionIds: ids })
    }
    this.sessionIds.clear()
  }
}
