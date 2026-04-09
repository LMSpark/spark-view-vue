/**
 * Generate Session Backend — 后端会话 HTTP 客户端实现。
 *
 * 实现 `SessionBackend` 接口（来自 session-orchestrator），
 * 调用 AiSessionController 的 RESTful 端点。
 *
 * @module generate-session-backend
 */

import type { SessionBackend, LlmResponse } from '../runtime/session-orchestrator'
import type { ToolCall, ToolDefinition } from '../tool-calling'

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface GenerateSessionBackendOptions {
  /** 后端基础 URL（如 http://localhost:8080） */
  baseUrl: string
  /** 可选 token */
  token?: string
}

// ═══════════════════════════════════════════════════════════
// Implementation
// ═══════════════════════════════════════════════════════════

/**
 * 创建 Generate 专用的后端会话客户端。
 *
 * 调用 `/api/ai/sessions/*` 端点（AiSessionController）。
 */
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
    const resp = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) } })
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
        body: JSON.stringify({ messages }),
      })
    },

    async getConversation(sessionId: string): Promise<Array<{ role: string; content: string }>> {
      return request<Array<{ role: string; content: string }>>(
        `/api/ai/sessions/${sessionId}/conversation`,
        { method: 'GET' },
      )
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
