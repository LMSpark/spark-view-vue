import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import type {
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionExposure,
  AiRuntimeMessageHistoryEntry,
  EditToolHost,
} from '@spark-view/spark-ai'
import type {
  PageModelFunctionContext,
  PageModelSessionHost,
} from '../src/views/app/dev-system/usePageModelSessionHost'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    onUnmounted: vi.fn(),
  }
})

import { usePageModelEditSession } from '../src/views/app/dev-system/usePageModelEditSession'

function createExposure(moduleId: string, functionId: string): AiRuntimeFunctionExposure {
  return {
    action: `page-1@${moduleId}@${functionId}`,
    moduleId,
    modulePath: moduleId,
    moduleIds: [moduleId],
    functionId,
    description: `${moduleId}.${functionId}`,
    paramsSchema: { type: 'object', properties: {} },
    contextParams: [],
  }
}

function createSessionHost(functions: readonly AiRuntimeFunctionExposure[]): {
  host: PageModelSessionHost
  createBackendSession: ReturnType<typeof vi.fn>
  executeBackendTurn: ReturnType<typeof vi.fn>
} {
  const context: PageModelFunctionContext = {
    sessionKey: 'page-1',
    scopeKey: 'pageDesign\u0000page-1',
    instanceId: 'session-1',
    runtimeInstanceId: 'page-1',
    moduleId: 'pageDesign',
    moduleInstanceId: 'page-1',
    availableFunctions: functions,
  }
  const createBackendSession = vi.fn(async () => 'backend-session-1')
  const executeBackendTurn = vi.fn(async () => ({ text: '', toolCalls: [] }))
  let resumeSessionId: string | undefined
  const host: PageModelSessionHost = {
    context: shallowRef(context),
    ensureSession: vi.fn(async () => context),
    reset: vi.fn(async () => {}),
    resetSync: vi.fn(),
    appendRuntimeMessage: vi.fn(async () => ({}) as AiRuntimeMessageHistoryEntry),
    setBackendSessionId: vi.fn((sessionId?: string) => {
      resumeSessionId = sessionId
    }),
    destroyBackendSession: vi.fn(async () => {
      resumeSessionId = undefined
    }),
    destroyBackendSessionById: vi.fn(async (sessionId: string) => {
      if (resumeSessionId === sessionId) {
        resumeSessionId = undefined
      }
    }),
    getResumeSessionOptions: vi.fn(() => (
      resumeSessionId !== undefined ? { resumeSessionId } : {}
    )),
    hasSessionMismatch: vi.fn(() => false),
    createBackendSession,
    executeFunctionCall: vi.fn(async () => ({
      result: { ok: true, data: {}, summary: 'ok' } as AiRuntimeFunctionCallResult<unknown>,
    })),
    appendBackendMessages: vi.fn(async () => {}),
    executeBackendTurn,
  }
  return { host, createBackendSession, executeBackendTurn }
}

describe('usePageModelEditSession tool projection', () => {
  it('does not expose jsonDoc tools for page-model editing sessions', async () => {
    const functions = [
      createExposure('lifecycle', 'bootstrap'),
      createExposure('nodeTree', 'countNodes'),
      createExposure('dataset', 'listTables'),
      createExposure('jsonDoc', 'read'),
    ]
    const { host, createBackendSession } = createSessionHost(functions)
    const editSession = usePageModelEditSession({
      getSessionKey: () => 'page-1',
      getEditToolHost: () => ({}) as EditToolHost,
      sessionHost: host,
    })

    await editSession.runLlm('检查当前页面', { skipBootstrap: true })

    const backendOptions = createBackendSession.mock.calls[0]?.[0]
    expect(backendOptions).toBeDefined()
    const descriptions = (backendOptions.tools as Array<{ function: { description: string } }>)
      .map(tool => tool.function.description)
    expect(descriptions.some(description => description.includes('@jsonDoc@'))).toBe(false)
    expect(descriptions.some(description => description.includes('@nodeTree@countNodes'))).toBe(true)
    expect(descriptions.some(description => description.includes('@dataset@listTables'))).toBe(true)
  })

  it('filters write tools by functionId in describe-only mode', async () => {
    const functions = [
      createExposure('nodeTree', 'countNodes'),
      createExposure('textModel', 'readScript'),
      createExposure('textModel', 'writeScript'),
    ]
    const { host, createBackendSession } = createSessionHost(functions)
    const editSession = usePageModelEditSession({
      getSessionKey: () => 'page-1',
      getEditToolHost: () => ({}) as EditToolHost,
      sessionHost: host,
    })

    await editSession.runLlm('先说明计划', { skipBootstrap: true, toolMode: 'describe-only' })

    const backendOptions = createBackendSession.mock.calls[0]?.[0]
    const descriptions = (backendOptions.tools as Array<{ function: { description: string } }>)
      .map(tool => tool.function.description)
    expect(descriptions.some(description => description.includes('@textModel@writeScript'))).toBe(false)
    expect(descriptions.some(description => description.includes('@textModel@readScript'))).toBe(true)
  })

  it('does not expose actions containing jsonDoc segment even if moduleId is allowed', async () => {
    const functions: AiRuntimeFunctionExposure[] = [
      {
        action: 'page-1@lifecycle@bootstrap',
        moduleId: 'lifecycle',
        modulePath: 'pageDesign/lifecycle',
        moduleIds: ['pageDesign', 'lifecycle'],
        functionId: 'bootstrap',
        description: 'lifecycle.bootstrap',
        paramsSchema: { type: 'object', properties: {} },
        contextParams: [],
      },
      {
        action: 'page-1@jsonDoc@read',
        moduleId: 'dataset',
        modulePath: 'pageDesign/dataset',
        moduleIds: ['pageDesign', 'dataset'],
        functionId: 'listTables',
        description: 'dataset.listTables',
        paramsSchema: { type: 'object', properties: {} },
        contextParams: [],
      },
    ]
    const { host, createBackendSession } = createSessionHost(functions)
    const editSession = usePageModelEditSession({
      getSessionKey: () => 'page-1',
      getEditToolHost: () => ({}) as EditToolHost,
      sessionHost: host,
    })

    await editSession.runLlm('检查当前页面', { skipBootstrap: true })

    const backendOptions = createBackendSession.mock.calls[0]?.[0]
    expect(backendOptions).toBeDefined()
    const descriptions = (backendOptions.tools as Array<{ function: { description: string } }>)
      .map(tool => tool.function.description)
    expect(descriptions.some(description => description.includes('@jsonDoc@'))).toBe(false)
    expect(descriptions.some(description => description.includes('@lifecycle@bootstrap'))).toBe(true)
  })

  it('blocks jsonDoc tool calls before executeFunctionCall even if leaked from backend session', async () => {
    const leakedExposure: AiRuntimeFunctionExposure = {
      action: 'page-1@jsonDoc@read',
      moduleId: 'lifecycle',
      modulePath: 'pageDesign/lifecycle',
      moduleIds: ['pageDesign', 'lifecycle'],
      functionId: 'bootstrap',
      description: 'lifecycle.bootstrap',
      paramsSchema: { type: 'object', properties: {} },
      contextParams: [],
    }
    const { host, executeBackendTurn } = createSessionHost([leakedExposure])
    const toolName = leakedExposure.action.replace(/[^a-zA-Z0-9_-]/g, '__')

    executeBackendTurn
      .mockResolvedValueOnce({
        text: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: toolName,
              arguments: '{}',
            },
          },
        ],
      })
      .mockResolvedValueOnce({ text: 'done', toolCalls: [] })

    const editSession = usePageModelEditSession({
      getSessionKey: () => 'page-1',
      getEditToolHost: () => ({}) as EditToolHost,
      sessionHost: host,
    })

    await expect(editSession.runLlm('继续执行', { skipBootstrap: true })).resolves.toBeUndefined()

    expect(host.executeFunctionCall).not.toHaveBeenCalled()
    expect(host.appendBackendMessages).toHaveBeenCalledTimes(1)
    const appendPayload = (host.appendBackendMessages as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Array<{ content: string }>
    expect(appendPayload?.[0]?.content).toContain('TOOL_NOT_ALLOWED_IN_PAGE_MODEL')
  })

  it('recreates backend session when turn hits recoverable state conflict', async () => {
    const functions = [
      createExposure('lifecycle', 'bootstrap'),
      createExposure('textModel', 'readScript'),
    ]
    const { host, createBackendSession, executeBackendTurn } = createSessionHost(functions)

    ;(host.getResumeSessionOptions as ReturnType<typeof vi.fn>)
      .mockImplementation(() => ({ resumeSessionId: 'backend-stale' }))

    executeBackendTurn
      .mockRejectedValueOnce(Object.assign(new Error('HTTP 409: Conflict'), {
        response: {
          error: {
            code: 'INVALID_STATE_TRANSITION',
          },
          handoff: {
            nextAction: '请人工确认后恢复到 PLAN',
          },
        },
      }))
      .mockResolvedValueOnce({ text: 'recovered', toolCalls: [] })

    const editSession = usePageModelEditSession({
      getSessionKey: () => 'page-1',
      getEditToolHost: () => ({}) as EditToolHost,
      sessionHost: host,
    })

    await expect(editSession.runLlm('继续执行', { skipBootstrap: true })).resolves.toBeUndefined()

    expect(host.destroyBackendSession).toHaveBeenCalledWith('pageDesign\u0000page-1', undefined)
    expect(createBackendSession).toHaveBeenCalledTimes(1)
    expect(executeBackendTurn).toHaveBeenCalledTimes(2)
  })

  it('uses isolated backend session when parallel turns are enabled', async () => {
    const functions = [
      createExposure('lifecycle', 'bootstrap'),
      createExposure('textModel', 'readScript'),
    ]
    const { host, createBackendSession, executeBackendTurn } = createSessionHost(functions)
    executeBackendTurn.mockResolvedValueOnce({ text: 'parallel-ok', toolCalls: [] })

    const editSession = usePageModelEditSession({
      getSessionKey: () => 'page-1',
      getEditToolHost: () => ({}) as EditToolHost,
      sessionHost: host,
    })

    await expect(editSession.runLlm('并行执行', {
      skipBootstrap: true,
      maxParallelTurns: 2,
    })).resolves.toBeUndefined()

    expect(createBackendSession).toHaveBeenCalledWith(expect.objectContaining({
      reuseScopeSession: false,
      bindToScope: false,
    }))
    expect(host.destroyBackendSessionById).toHaveBeenCalledWith('backend-session-1', undefined)
  })
})
