/**
 * SessionBackendImpl 单元测试
 *
 * 测试目标：验证 SessionBackend HTTP 客户端的正确性
 * - 会话创建 (createSession)
 * - 执行轮次 (executeTurn)
 * - 追加消息 (appendMessages)
 * - 获取对话 (getConversation)
 * - 销毁会话 (destroySession / destroyAllSessions)
 *
 * 注意：由于 SessionBackendImpl 使用 createRequest (spark-utils 的 HTTP 客户端),
 * 我们测试其接口契约和类型安全性，而非实际 HTTP 调用。
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SessionBackendImpl,
  configureSessionBackend,
  type SessionBackend,
  type LlmResponse,
} from '@spark-view/spark-ai'

describe('SessionBackendImpl', () => {
  describe('interface compliance', () => {
    it('should implement SessionBackend interface', () => {
      const backend = new SessionBackendImpl('http://localhost:8080')

      // 验证接口方法存在
      expect(typeof backend.createSession).toBe('function')
      expect(typeof backend.executeTurn).toBe('function')
      expect(typeof backend.appendMessages).toBe('function')
      expect(typeof backend.getConversation).toBe('function')
      expect(typeof backend.destroySession).toBe('function')
      expect(typeof backend.destroyAllSessions).toBe('function')
    })

    it('should be assignable to SessionBackend type', () => {
      const backend: SessionBackend = new SessionBackendImpl('http://localhost:8080')
      expect(backend).toBeDefined()
    })
  })

  describe('constructor', () => {
    it('should accept baseUrl parameter', () => {
      const backend = new SessionBackendImpl('http://custom-api.com/api/ai/sessions')
      expect(backend).toBeInstanceOf(SessionBackendImpl)
    })

    it('should work with default baseUrl', () => {
      const backend = new SessionBackendImpl()
      expect(backend).toBeInstanceOf(SessionBackendImpl)
    })
  })

  describe('method signatures', () => {
    let backend: SessionBackendImpl

    beforeEach(() => {
      backend = new SessionBackendImpl('http://localhost:8080')
    })

    it('createSession signature should be callable', () => {
      // 仅做签名契约断言，避免触发真实网络调用。
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
  })
})

describe('configureSessionBackend', () => {
  it('should accept getHeaders option', () => {
    expect(() => {
      configureSessionBackend({
        getHeaders: () => ({
          'Authorization': 'Bearer test-token',
          'X-Custom': 'value',
        }),
      })
    }).not.toThrow()
  })

  it('should accept empty options', () => {
    expect(() => {
      configureSessionBackend({})
    }).not.toThrow()
  })
})

describe('LlmResponse type', () => {
  it('should have correct structure', () => {
    // 类型测试：验证 LlmResponse 结构
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

