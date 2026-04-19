/**
 * 会话后端 HTTP 客户端统一实现。
 *
 * - SessionBackendImpl：运行时 stills 会话客户端（基于 createRequest）
 * - createGenerateSessionBackend：生成链会话客户端（基于 fetch）
 */

import { createRequest } from '@spark-view/spark-utils'
import type { SessionBackend, LlmResponse } from './runtime/session-orchestrator'
import type { ToolCall, ToolDefinition } from './tool-calling'

let _getHeaders: (() => Record<string, string>) | null = null

export function configureSessionBackend(options: {
  getHeaders?: () => Record<string, string>
}): void {
  if (options.getHeaders) {
    _getHeaders = options.getHeaders
  }
}

export class SessionBackendImpl implements SessionBackend {
  private http = createRequest({ timeout: 300_000 })
  private sessionIds = new Set<string>()
  private baseUrl: string

  constructor(baseUrl = '/api/ai/sessions') {
    this.baseUrl = baseUrl

    this.http.interceptors.request.use({
      onRequest: (config) => {
        if (_getHeaders) {
          config.headers = { ...config.headers, ..._getHeaders() }
        }
        return config
      },
    })
  }

  async createSession(
    systemPrompt: string,
    userPrompt: string,
    windowSize: number,
    tools?: ToolDefinition[],
  ): Promise<string> {
    const resp = await this.http.post<{ sessionId: string }>(`${this.baseUrl}`, {
      protocolVersion: 3,
      systemPrompt,
      userPrompt,
      windowSize,
      mode: 'stills',
      tools: tools ?? null,
    })

    const sessionId = resp.sessionId
    this.sessionIds.add(sessionId)
    return sessionId
  }

  async executeTurn(sessionId: string): Promise<LlmResponse | null> {
    try {
      const resp = await this.http.post<{
        text: string
        reasoning?: string
        toolCalls?: ToolCall[]
      }>(`${this.baseUrl}/${sessionId}/turn`, {
        protocolVersion: 3,
      })

      const result: LlmResponse = { text: resp.text }
      if (resp.reasoning !== undefined) result.reasoning = resp.reasoning
      if (resp.toolCalls !== undefined) result.toolCalls = resp.toolCalls
      return result
    } catch (err) {
      console.error('[SessionBackend] executeTurn failed:', err)
      return null
    }
  }

  async appendMessages(
    sessionId: string,
    messages: Array<{
      role: string
      content: string
      tool_call_id?: string
      tool_calls?: ToolCall[]
    }>,
  ): Promise<void> {
    await this.http.post(`${this.baseUrl}/${sessionId}/append`, {
      protocolVersion: 3,
      messages,
    })
  }

  async getConversation(
    sessionId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const resp = await this.http.get<{ conversation: Array<{ role: string; content: string }> }>(
      `${this.baseUrl}/${sessionId}/conversation`
    )

    return resp.conversation
  }

  async destroySession(sessionId: string): Promise<void> {
    await this.http.delete(`${this.baseUrl}/${sessionId}`)
    this.sessionIds.delete(sessionId)
  }

  async destroyAllSessions(): Promise<void> {
    const ids = Array.from(this.sessionIds)
    for (const sessionId of ids) {
      await this.http.delete(`${this.baseUrl}/${sessionId}`)
    }
    this.sessionIds.clear()
  }
}

export interface GenerateSessionBackendOptions {
  baseUrl: string
  token?: string
}

export function createGenerateSessionBackend(
  options: GenerateSessionBackendOptions,
): SessionBackend {
  const { baseUrl } = options
  const sessionIds: Set<string> = new Set()

  function headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (options.token) {
      h['Authorization'] = `Bearer ${options.token}`
    }
    return h
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}`
    const resp = await fetch(url, {
      ...init,
      headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`HTTP ${resp.status}: ${text}`)
    }
    return resp.json() as Promise<T>
  }

  return {
    async createSession(
      systemPrompt: string,
      userPrompt: string,
      windowSize: number,
      tools?: ToolDefinition[],
    ): Promise<string> {
      const body: Record<string, unknown> = {
        protocolVersion: 3,
        systemPrompt,
        userPrompt,
        windowSize,
        mode: 'generate',
      }
      if (tools) {
        body['tools'] = tools
      }
      const result = await request<{ sessionId: string }>('/api/ai/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      sessionIds.add(result.sessionId)
      return result.sessionId
    },

    async executeTurn(sessionId: string): Promise<LlmResponse | null> {
      try {
        const result = await request<{
          text?: string
          reasoning?: string
          toolCalls?: ToolCall[]
        }>(`/api/ai/sessions/${sessionId}/turn`, {
          method: 'POST',
          body: JSON.stringify({ protocolVersion: 3 }),
        })
        return {
          text: result.text ?? '',
          ...(result.reasoning !== undefined ? { reasoning: result.reasoning } : {}),
          ...(result.toolCalls !== undefined ? { toolCalls: result.toolCalls } : {}),
        }
      } catch {
        return null
      }
    },

    async appendMessages(
      sessionId: string,
      messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: ToolCall[] }>,
    ): Promise<void> {
      await request<unknown>(`/api/ai/sessions/${sessionId}/append`, {
        method: 'POST',
        body: JSON.stringify({ protocolVersion: 3, messages }),
      })
    },

    async getConversation(sessionId: string): Promise<Array<{ role: string; content: string }>> {
      const result = await request<{ conversation: Array<{ role: string; content: string }> }>(
        `/api/ai/sessions/${sessionId}/conversation`,
        { method: 'GET' },
      )
      return result.conversation
    },

    async destroySession(sessionId: string): Promise<void> {
      await request<unknown>(`/api/ai/sessions/${sessionId}`, { method: 'DELETE' })
      sessionIds.delete(sessionId)
    },

    async destroyAllSessions(): Promise<void> {
      if (sessionIds.size === 0) return
      const ids = [...sessionIds]
      await request<unknown>('/api/ai/sessions', {
        method: 'DELETE',
        body: JSON.stringify({ sessionIds: ids }),
      })
      sessionIds.clear()
    },
  }
}
