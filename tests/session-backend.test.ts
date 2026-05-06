/**
 * SessionBackend 单元测试
 *
 * 测试目标：验证 SessionBackend HTTP 客户端的正确性
 * - 会话创建 (createSession)
 * - 执行轮次 (executeTurn)
 * - 追加消息 (appendMessages)
 * - 获取对话 (getConversation)
 * - 销毁会话 (destroySession / destroyAllSessions)
 *
 * 注意：由于 SessionBackend 使用 createRequest (spark-utils 的 HTTP 客户端),
 * 我们测试其接口契约和类型安全性，而非实际 HTTP 调用。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createSessionBackend,
  type SessionBackend,
  type LlmResponse,
} from '@spark-view/spark-ai'

const {
  mockPost,
  mockGet,
  mockDelete,
  mockStreamSSE,
  mockRequestUse,
} = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
  mockStreamSSE: vi.fn(),
  mockRequestUse: vi.fn(),
}))

vi.mock('@spark-view/spark-utils', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@spark-view/spark-utils')
  return {
    ...actual,
    createRequest: () => ({
      post: mockPost,
      get: mockGet,
      delete: mockDelete,
      interceptors: {
        request: { use: mockRequestUse },
        response: { use: vi.fn() },
      },
    }),
    createFetchClient: () => ({
      streamSSE: mockStreamSSE,
    }),
  }
})

beforeEach(() => {
  mockPost.mockReset()
  mockGet.mockReset()
  mockDelete.mockReset()
  mockStreamSSE.mockReset()
  mockRequestUse.mockReset()
})

describe('SessionBackend', () => {
  describe('interface compliance', () => {
    it('should implement SessionBackend interface', () => {
      const backend = createSessionBackend('http://localhost:8080')

      expect(typeof backend.createSession).toBe('function')
      expect(typeof backend.executeTurn).toBe('function')
      expect(typeof backend.appendMessages).toBe('function')
      expect(typeof backend.getConversation).toBe('function')
      expect(typeof backend.destroySession).toBe('function')
      expect(typeof backend.destroyAllSessions).toBe('function')
    })

    it('should be assignable to SessionBackend type', () => {
      const backend: SessionBackend = createSessionBackend('http://localhost:8080')
      expect(backend).toBeDefined()
    })
  })

  describe('constructor', () => {
    it('should accept baseUrl parameter', () => {
      const backend = createSessionBackend('http://custom-api.com/api/ai/sessions')
      expect(backend).toBeDefined()
    })

    it('should work with default baseUrl', () => {
      const backend = createSessionBackend()
      expect(backend).toBeDefined()
    })
  })

  describe('method signatures', () => {
    let backend: SessionBackend

    beforeEach(() => {
      backend = createSessionBackend('http://localhost:8080')
    })

    it('createSession signature should be callable', () => {
      const fn: SessionBackend['createSession'] = backend.createSession.bind(backend)
      expect(typeof fn).toBe('function')
    })

    it('executeTurn signature should be callable', () => {
      const fn: SessionBackend['executeTurn'] = backend.executeTurn.bind(backend)
      expect(typeof fn).toBe('function')
    })

    it('appendMessages signature should be callable', () => {
      const fn: SessionBackend['appendMessages'] = backend.appendMessages.bind(backend)
      expect(typeof fn).toBe('function')
    })

    it('executeTurn fails fast when SSE endpoint is unavailable', async () => {
      mockStreamSSE.mockRejectedValue({ status: 404, message: 'stream route missing' })

      await expect(backend.executeTurn('session-1')).rejects.toThrow('HTTP 404')
      expect(mockStreamSSE).toHaveBeenCalledOnce()
      expect(mockPost).not.toHaveBeenCalled()
    })
  })
})

describe('SessionBackend options', () => {
  it('createSessionBackend should expose a SessionBackend-compatible instance', () => {
    const backend = createSessionBackend('http://localhost:8080', {
      getHeaders: () => ({ Authorization: 'Bearer test-token' }),
    })

    expect(backend).toBeDefined()
    expect(typeof backend.createSession).toBe('function')
    expect(typeof backend.executeTurn).toBe('function')
  })

  it('should accept getHeaders option in constructor', () => {
    expect(() => {
      createSessionBackend('http://localhost:8080', {
        getHeaders: () => ({
          'Authorization': 'Bearer test-token',
          'X-Custom': 'value',
        }),
      })
    }).not.toThrow()
  })

  it('should accept onSseEvent option in constructor', () => {
    expect(() => {
      createSessionBackend('http://localhost:8080', {
        onSseEvent: () => {},
      })
    }).not.toThrow()
  })
})

describe('LlmResponse type', () => {
  it('should have correct structure', () => {
    const response: LlmResponse = {
      text: 'AI response',
      reasoning: 'thinking...',
      toolCalls: [
        {
          id: 'call-1',
          function: {
            name: 'dataset_crud_create_table',
            arguments: '{"tableName":"users"}',
          },
        },
      ],
    }

    expect(response.text).toBe('AI response')
    expect(response.reasoning).toBe('thinking...')
    expect(response.toolCalls).toHaveLength(1)
  })

  it('should allow optional fields', () => {
    const response: LlmResponse = {
      text: 'Simple response',
    }

    expect(response.text).toBe('Simple response')
    expect(response.reasoning).toBeUndefined()
    expect(response.toolCalls).toBeUndefined()
  })
})
