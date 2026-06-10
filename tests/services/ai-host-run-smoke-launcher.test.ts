import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  httpPost: vi.fn(),
  waitForAppSseConnection: vi.fn().mockResolvedValue(undefined),
  onAiHostRunResult: vi.fn(() => () => undefined),
  login: vi.fn().mockResolvedValue(undefined),
  switchProject: vi.fn(),
  getProjectDetail: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/services/http', () => ({
  http: {
    post: mocks.httpPost,
    get: mocks.getProjectDetail,
  },
}))

vi.mock('@/services/sse-events', () => ({
  onAiHostRunResult: mocks.onAiHostRunResult,
  waitForAppSseConnection: mocks.waitForAppSseConnection,
}))

vi.mock('@/services/auth', () => ({
  login: mocks.login,
  switchProject: mocks.switchProject,
}))

vi.mock('@/services/navigation-sync', () => ({
  reloadAndSyncNavigation: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/services/api-paths', () => ({
  getProjectDetailApi: (projectId: string, tenantId: string) =>
    `/api/tenants/${tenantId}/projects/${projectId}`,
  getProjectApi: (tenantId: string) => `/api/tenants/${tenantId}/projects`,
}))

function encodePayload(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

describe('runAiHostRunSmokeLauncherFromUrl', () => {
  it('creates the project when detail lookup returns project-missing 400', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(),
    })

    const requestId = 'hr-sse-create-project'
    const payload = {
      requestId,
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: 'smoke',
      },
      timeoutMs: 30_000,
      ensureProject: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
      },
    }
    window.history.replaceState({}, '', `/login?sparkAiHostRun=${encodePayload(payload)}`)

    mocks.getProjectDetail.mockRejectedValueOnce(Object.assign(new Error('项目不存在: hr-enterprise-planning-smoke'), {
      name: 'RequestError',
      status: 400,
      response: {
        protocolVersion: 4,
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: '项目不存在: hr-enterprise-planning-smoke',
        },
      },
    }))
    mocks.httpPost
      .mockResolvedValueOnce({ projectId: 'hr-enterprise-planning-smoke' })
      .mockResolvedValueOnce({ accepted: true, delivered: true, requestId })
    mocks.onAiHostRunResult.mockImplementation(((callback: (event: {
      requestId: string
      alias: string
      status: string
    }) => void) => {
      queueMicrotask(() => {
        callback({
          requestId,
          alias: 'projectPlanning',
          status: 'completed',
        })
      })
      return () => undefined
    }) as typeof mocks.onAiHostRunResult)

    const { runAiHostRunSmokeLauncherFromUrl } = await import('@/services/ai-host-run-smoke-launcher')
    runAiHostRunSmokeLauncherFromUrl()
    await vi.waitFor(() => {
      expect(mocks.httpPost).toHaveBeenCalled()
    })
    expect(mocks.httpPost.mock.calls[0]?.[0]).toBe('/api/tenants/lmspark/projects')
  })

  it('waits for APP SSE before posting host-run request and retries APP_SSE_NOT_CONNECTED', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(),
    })

    const requestId = 'hr-sse-retry'
    const payload = {
      requestId,
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: 'smoke',
      },
      timeoutMs: 30_000,
      ensureProject: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
      },
    }
    const encoded = encodePayload(payload)
    window.history.replaceState({}, '', `/login?sparkAiHostRun=${encoded}`)

    mocks.getProjectDetail.mockResolvedValueOnce({ projectId: 'hr-enterprise-planning-smoke' })
    mocks.httpPost
      .mockRejectedValueOnce(Object.assign(new Error('APP_SSE_NOT_CONNECTED'), {
        name: 'RequestError',
        status: 409,
        code: 'APP_SSE_NOT_CONNECTED',
      }))
      .mockResolvedValueOnce({ accepted: true, delivered: true, requestId })

    mocks.onAiHostRunResult.mockImplementation(((callback: (event: {
      requestId: string
      alias: string
      status: string
    }) => void) => {
      queueMicrotask(() => {
        callback({
          requestId,
          alias: 'projectPlanning',
          status: 'completed',
        })
      })
      return () => undefined
    }) as typeof mocks.onAiHostRunResult)

    const { runAiHostRunSmokeLauncherFromUrl } = await import('@/services/ai-host-run-smoke-launcher')
    runAiHostRunSmokeLauncherFromUrl()
    await vi.waitFor(() => {
      expect(mocks.httpPost).toHaveBeenCalledTimes(2)
    })

    expect(mocks.waitForAppSseConnection).toHaveBeenCalled()
    expect(mocks.httpPost.mock.calls.some(call => call[0] === '/api/ai/host-run/request')).toBe(true)
    expect(mocks.switchProject).toHaveBeenCalledWith('hr-enterprise-planning-smoke')
  })

  it('logs in before waiting for APP SSE when login payload is present', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(),
    })

    const calls: string[] = []
    mocks.login.mockImplementationOnce(async () => {
      calls.push('login')
    })
    mocks.waitForAppSseConnection.mockImplementationOnce(async () => {
      calls.push('wait-sse')
    })
    mocks.httpPost.mockResolvedValueOnce({ accepted: true, delivered: true })
    mocks.onAiHostRunResult.mockImplementation(((callback: (event: {
      requestId: string
      alias: string
      status: string
    }) => void) => {
      queueMicrotask(() => {
        callback({
          requestId: 'transport-login-order',
          alias: '__transport_probe__',
          status: 'unknown_alias',
        })
      })
      return () => undefined
    }) as typeof mocks.onAiHostRunResult)

    window.history.replaceState({}, '', `/login?sparkAiHostRun=${encodePayload({
      requestId: 'transport-login-order',
      alias: '__transport_probe__',
      args: { probe: 'transport' },
      timeoutMs: 30_000,
      login: { tenantId: 'lmspark', username: 'admin', password: 'admin123' },
    })}`)

    const { runAiHostRunSmokeLauncherFromUrl } = await import('@/services/ai-host-run-smoke-launcher')
    runAiHostRunSmokeLauncherFromUrl()
    await vi.waitFor(() => {
      expect(mocks.httpPost).toHaveBeenCalledWith('/api/ai/host-run/request', expect.any(Object))
    })

    expect(calls).toEqual(['login', 'wait-sse'])
  })
})
