import { beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  createFetchClient: vi.fn(),
  post: vi.fn(),
  registerModule: vi.fn(),
  startInstance: vi.fn(),
  stopInstance: vi.fn(),
  appendMessage: vi.fn(),
  executeFunctionCall: vi.fn(),
}))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onUnmounted: vi.fn(),
  }
})

vi.mock('@spark-view/spark-utils', () => ({
  createFetchClient: shared.createFetchClient,
}))

vi.mock('@/services/http', () => ({
  createAuthHeaders: () => ({
    Authorization: 'Bearer test-token',
    'X-Tenant-Id': 'lmspark',
    'X-Project-Id': 'homepage',
  }),
}))

vi.mock('@spark-view/spark-ai', () => ({
  AiRuntime: class {
    registerModule = shared.registerModule
    startInstance = shared.startInstance
    stopInstance = shared.stopInstance
    appendMessage = shared.appendMessage
  },
  PageDesignModule: class {
    static moduleId = 'pageDesign'
    executeFunctionCall = shared.executeFunctionCall
  },
}))

import {
  PAGE_MODEL_AI_SESSION_TIMEOUT_MS,
  usePageModelSessionHost,
} from '../src/views/app/dev-system/usePageModelSessionHost'

function mockStartedSession(moduleInstanceId: string) {
  return {
    status: 'Started',
    instanceId: moduleInstanceId,
    moduleId: 'pageDesign',
    moduleInstanceId,
    scope: {
      moduleId: 'pageDesign',
      moduleInstanceId,
      instanceId: moduleInstanceId,
      runtimeInstanceId: moduleInstanceId,
    },
    lifecycle: {
      moduleId: 'pageDesign',
      moduleInstanceId,
      instanceId: moduleInstanceId,
      runtimeInstanceId: moduleInstanceId,
      status: 'Started',
    },
    session: {},
    availableFunctions: [],
    module: {},
    promptSnapshot: '',
  }
}

describe('usePageModelSessionHost transport', () => {
  beforeEach(() => {
    shared.createFetchClient.mockReset()
    shared.createFetchClient.mockReturnValue({ post: shared.post })
    shared.post.mockReset()
    shared.registerModule.mockReset()
    shared.startInstance.mockReset()
    shared.stopInstance.mockReset()
    shared.appendMessage.mockReset()
    shared.executeFunctionCall.mockReset()
    shared.startInstance.mockImplementation(async (options: { moduleInstanceId: string }) => (
      mockStartedSession(options.moduleInstanceId)
    ))
  })

  it('uses a long-lived fetch client for page-model AI session requests', async () => {
    shared.post
      .mockResolvedValueOnce({ sessionId: 'session-1' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ text: 'done' })

    const host = usePageModelSessionHost({
      getEditToolHost: () => ({}) as never,
      getSessionKey: () => 'orders-page',
    })

    expect(shared.createFetchClient).toHaveBeenCalledWith({
      timeout: PAGE_MODEL_AI_SESSION_TIMEOUT_MS,
    })

    await expect(host.createBackendSession({
      systemPrompt: 'system',
      userPrompt: 'user',
      tools: [],
    })).resolves.toBe('session-1')

    expect(shared.post.mock.calls[0]?.[1]).toMatchObject({
      protocolVersion: 3,
      scope: {
        moduleId: 'pageDesign',
        moduleInstanceId: 'orders-page',
        instanceId: 'orders-page',
        runtimeInstanceId: 'orders-page',
      },
      metadata: {
        source: 'dev-system-page-model',
        trace: {
          moduleId: 'pageDesign',
          moduleInstanceId: 'orders-page',
        },
      },
    })

    await expect(host.appendBackendMessages([
      { role: 'user', content: 'next' },
    ])).resolves.toBeUndefined()

    expect(shared.post.mock.calls[1]?.[1]).toMatchObject({
      protocolVersion: 3,
      scope: {
        moduleId: 'pageDesign',
        moduleInstanceId: 'orders-page',
      },
      messages: [{ role: 'user', content: 'next' }],
    })

    await expect(host.executeBackendTurn()).resolves.toEqual({ text: 'done' })

    expect(shared.post.mock.calls[2]?.[1]).toMatchObject({
      protocolVersion: 3,
      scope: {
        moduleId: 'pageDesign',
        moduleInstanceId: 'orders-page',
      },
      stream: false,
    })
  })

  it('keeps backend sessions isolated by module scope when pages overlap', async () => {
    let pageId = 'page-a'
    shared.post
      .mockResolvedValueOnce({ sessionId: 'backend-a' })
      .mockResolvedValueOnce({ sessionId: 'backend-b' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ text: 'page-a done' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ text: 'page-b done' })

    const host = usePageModelSessionHost({
      getEditToolHost: () => ({}) as never,
      getSessionKey: () => pageId,
    })

    const pageA = await host.ensureSession()
    await host.createBackendSession({
      context: pageA,
      systemPrompt: 'system-a',
      userPrompt: 'user-a',
      tools: [],
    })

    pageId = 'page-b'
    host.resetSync()
    const pageB = await host.ensureSession()
    await host.createBackendSession({
      context: pageB,
      systemPrompt: 'system-b',
      userPrompt: 'user-b',
      tools: [],
    })

    await host.appendBackendMessages([{ role: 'user', content: 'continue-a' }], undefined, pageA.scopeKey)
    await expect(host.executeBackendTurn(undefined, pageA.scopeKey)).resolves.toEqual({ text: 'page-a done' })

    await host.appendBackendMessages([{ role: 'user', content: 'continue-b' }], undefined, pageB.scopeKey)
    await expect(host.executeBackendTurn(undefined, pageB.scopeKey)).resolves.toEqual({ text: 'page-b done' })

    expect(shared.post.mock.calls[2]?.[0]).toBe('/api/ai/sessions/backend-a/append')
    expect(shared.post.mock.calls[3]?.[0]).toBe('/api/ai/sessions/backend-a/turn')
    expect(shared.post.mock.calls[4]?.[0]).toBe('/api/ai/sessions/backend-b/append')
    expect(shared.post.mock.calls[5]?.[0]).toBe('/api/ai/sessions/backend-b/turn')
    expect(shared.post.mock.calls[2]?.[1]).toMatchObject({
      scope: { moduleId: 'pageDesign', moduleInstanceId: 'page-a' },
    })
    expect(shared.post.mock.calls[4]?.[1]).toMatchObject({
      scope: { moduleId: 'pageDesign', moduleInstanceId: 'page-b' },
    })
  })
})
