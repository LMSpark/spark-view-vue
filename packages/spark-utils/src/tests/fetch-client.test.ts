import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFetchClient } from '@spark-view/spark-utils'

describe('FetchClient error handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('includes JSON response message in HTTP error details', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error: 'TENANT_EXISTS',
      message: '租户 ID 已存在: demo',
    }), {
      status: 409,
      statusText: 'Conflict',
      headers: {
        'content-type': 'application/json',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createFetchClient({ baseURL: '/api' })

    await expect(client.post('/auth/register-tenant', { tenantId: 'demo' }))
      .rejects.toMatchObject({
        status: 409,
        message: '租户 ID 已存在: demo',
        response: {
          error: 'TENANT_EXISTS',
          message: '租户 ID 已存在: demo',
        },
      })
  })

  it('synthesizes a readable message from AI error envelopes without error.message', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      error: {
        code: 'SESSION_SCOPE_MISMATCH',
        category: 'session-scope',
        retryPolicy: 'recreate-session',
      },
      handoff: {
        reasonCode: 'SESSION_SCOPE_MISMATCH',
        nextAction: '重新创建或切换到匹配当前 moduleId/moduleInstanceId 的 AI 后端会话',
      },
    }), {
      status: 409,
      statusText: 'Conflict',
      headers: {
        'content-type': 'application/json',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createFetchClient({ baseURL: '/api' })

    await expect(client.post('/ai/sessions/session-1/turn', { protocolVersion: 3 }))
      .rejects.toMatchObject({
        status: 409,
        message: '后端 AI 会话与当前模块实例不匹配：重新创建或切换到匹配当前 moduleId/moduleInstanceId 的 AI 后端会话',
      })
  })
})
