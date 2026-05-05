import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, shallowRef } from 'vue'
import type { DevState, PageFileName } from '../src/views/app/dev-system/useDevState'

const shared = vi.hoisted(() => {
  const runLlm = vi.fn(async () => {})
  const bootstrap = vi.fn(async () => {})
  const reset = vi.fn()
  const resetSync = vi.fn()
  const getResumeSessionOptions = vi.fn(() => ({}))

  return {
    bootstrap,
    runLlm,
    reset,
    resetSync,
    getResumeSessionOptions,
  }
})

const reportAiFcErrorMock = vi.hoisted(() => vi.fn(async () => ({ reportId: 'report-dev-1' })))

vi.mock('../src/services/ai-fc-error-monitor', () => ({
  reportAiFcError: reportAiFcErrorMock,
}))

vi.mock('../src/views/app/dev-system/usePageModelSessionHost', () => ({
  usePageModelSessionHost: () => ({
    backend: {} as never,
    session: shallowRef(null),
    ensureSession: vi.fn(),
    reset: vi.fn(async () => {}),
    resetSync: shared.resetSync,
    setBackendSessionId: vi.fn(),
    getResumeSessionOptions: shared.getResumeSessionOptions,
    hasSessionMismatch: vi.fn(() => false),
  }),
}))

vi.mock('../src/views/app/dev-system/usePageModelEditSession', () => ({
  usePageModelEditSession: () => ({
    bootstrap: shared.bootstrap,
    runLlm: shared.runLlm,
    reset: shared.reset,
    log: ref([]),
  }),
}))

import { useDevPageModelSession } from '../src/views/app/dev-system/page-model-session'

function createState(): {
  state: DevState
  ensureActivePageFilesLoadedMock: ReturnType<typeof vi.fn>
} {
  const documents = {
    'rule.json': {
      model: ref<{ toJSON: () => { children: unknown[] } } | null>(null),
      text: ref(''),
    },
    'pagedata.json': {
      model: ref<{ toJson: () => { tables: Record<string, unknown> } } | null>(null),
      text: ref(''),
    },
    'script.js': {
      model: ref<string | null>(null),
      text: ref(''),
    },
    'style.css': {
      model: ref<string | null>(null),
      text: ref(''),
    },
  }

  const ensureActivePageFilesLoaded = vi.fn(async () => {
    documents['rule.json'].model.value = {
      toJSON: () => ({ children: [{ id: 'orders-table' }, { id: 'customers-table' }] }),
    }
    documents['pagedata.json'].model.value = {
      toJson: () => ({ tables: { Orders: {}, Customers: {}, Employees: {} } }),
    }
    documents['script.js'].text.value = 'console.log("loaded")\n'
    documents['style.css'].text.value = '.page { color: red; }\n'
  })

  const state = {
    activePageId: ref('orders-page'),
    documents,
    ensureActivePageFilesLoaded,
    getEditToolHost: vi.fn(() => ({})),
    addStatus: vi.fn(),
  } as unknown as DevState

  return {
    state,
    ensureActivePageFilesLoadedMock: ensureActivePageFilesLoaded,
  }
}

describe('useDevPageModelSession', () => {
  beforeEach(() => {
    shared.bootstrap.mockClear()
    shared.runLlm.mockClear()
    shared.reset.mockClear()
    shared.resetSync.mockClear()
    shared.getResumeSessionOptions.mockClear()
    shared.getResumeSessionOptions.mockReturnValue({})
    reportAiFcErrorMock.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads page files before building the continuation prompt', async () => {
    const { state, ensureActivePageFilesLoadedMock } = createState()
    const scope = effectScope()
    const activeFile = ref<PageFileName | null>('rule.json')
    let sessionConfig: ReturnType<typeof useDevPageModelSession> | null = null

    scope.run(() => {
      sessionConfig = useDevPageModelSession({ state, activeFile })
    })

    await sessionConfig!.config.sender({
      historyMsgs: [{ role: 'user', content: '订单管理加入业务人' }],
      mode: 'multi',
      onDelta: vi.fn(),
    })

    expect(state.ensureActivePageFilesLoaded).toHaveBeenCalledTimes(1)
    expect(shared.bootstrap).toHaveBeenCalledWith({ silent: true, skipContextLoad: true })
    expect(shared.runLlm).toHaveBeenCalledTimes(1)

    const firstRunArgs = shared.runLlm.mock.calls[0]
    if (!firstRunArgs) {
      throw new Error('expected runLlm to be called once')
    }
    const prompt = (firstRunArgs as unknown[])[0]
    expect(typeof prompt).toBe('string')
    expect(prompt).toContain('ruleChildrenCount=2')
    expect(prompt).toContain('datasetTableCount=3')
    expect(prompt).toContain('scriptLength=22')
    expect(prompt).toContain('styleLength=22')

    const ensureCallOrder = ensureActivePageFilesLoadedMock.mock.invocationCallOrder[0]
    const runLlmCallOrder = shared.runLlm.mock.invocationCallOrder[0]
    if (ensureCallOrder === undefined || runLlmCallOrder === undefined) {
      throw new Error('expected ensureActivePageFilesLoaded and runLlm invocation order')
    }
    expect(ensureCallOrder).toBeLessThan(runLlmCallOrder)

    scope.stop()
  })

  it('bootstraps the page-model edit session when the AI panel opens', async () => {
    const { state, ensureActivePageFilesLoadedMock } = createState()
    const scope = effectScope()
    const activeFile = ref<PageFileName | null>('rule.json')
    let sessionConfig: ReturnType<typeof useDevPageModelSession> | null = null

    scope.run(() => {
      sessionConfig = useDevPageModelSession({ state, activeFile })
    })

    await sessionConfig!.config.beforeOpen?.()

    expect(state.ensureActivePageFilesLoaded).toHaveBeenCalledTimes(1)
    expect(shared.bootstrap).toHaveBeenCalledTimes(1)
    expect(shared.bootstrap).toHaveBeenCalledWith({ silent: true, skipContextLoad: true })

    const ensureCallOrder = ensureActivePageFilesLoadedMock.mock.invocationCallOrder[0]
    const bootstrapCallOrder = shared.bootstrap.mock.invocationCallOrder[0]
    if (ensureCallOrder === undefined || bootstrapCallOrder === undefined) {
      throw new Error('expected ensureActivePageFilesLoaded and bootstrap invocation order')
    }
    expect(ensureCallOrder).toBeLessThan(bootstrapCallOrder)

    scope.stop()
  })

  it('applies panel policies to the page-model edit run', async () => {
    const { state } = createState()
    const scope = effectScope()
    const activeFile = ref<PageFileName | null>('rule.json')
    let sessionConfig: ReturnType<typeof useDevPageModelSession> | null = null

    scope.run(() => {
      sessionConfig = useDevPageModelSession({ state, activeFile })
    })

    await sessionConfig!.config.sender({
      historyMsgs: [{ role: 'user', content: '先给计划' }],
      mode: 'multi',
      policies: { recovery: 'strict', collaboration: 'plan-confirm' },
      onDelta: vi.fn(),
    })

    const firstRunArgs = shared.runLlm.mock.calls[0]
    if (!firstRunArgs) {
      throw new Error('expected runLlm to be called once')
    }
    const prompt = (firstRunArgs as unknown[])[0]
    const options = (firstRunArgs as unknown[])[1] as Record<string, unknown>

    expect(prompt).toContain('[人机协同策略]')
    expect(prompt).toContain('恢复策略=strict')
    expect(prompt).toContain('协作策略=plan-confirm')
    expect(options['toolMode']).toBe('describe-only')
    expect(options['originalUserInput']).toBe('先给计划')
    expect(options['repeatDetection']).toMatchObject({
      maxSameSignature: 3,
      maxConsecutiveErrors: 3,
      maxReadOnlyActions: 8,
      abortOnReadOnlyLimit: true,
    })

    scope.stop()
  })

  it('does not run the model when collaboration policy is human takeover', async () => {
    const { state } = createState()
    const scope = effectScope()
    const activeFile = ref<PageFileName | null>('rule.json')
    let sessionConfig: ReturnType<typeof useDevPageModelSession> | null = null
    const onDelta = vi.fn()

    scope.run(() => {
      sessionConfig = useDevPageModelSession({ state, activeFile })
    })

    await sessionConfig!.config.sender({
      historyMsgs: [{ role: 'user', content: '我来手动改' }],
      mode: 'multi',
      policies: { recovery: 'manual', collaboration: 'human-takeover' },
      onDelta,
    })

    expect(shared.runLlm).not.toHaveBeenCalled()
    expect(onDelta).toHaveBeenCalledWith(expect.stringContaining('人工接管'))

    scope.stop()
  })

  it('forwards raw SSE and completed FC calls to request diagnostics', async () => {
    const { state } = createState()
    const scope = effectScope()
    const activeFile = ref<PageFileName | null>('rule.json')
    let sessionConfig: ReturnType<typeof useDevPageModelSession> | null = null
    const onSseEvent = vi.fn()
    const onFcCall = vi.fn()

    scope.run(() => {
      sessionConfig = useDevPageModelSession({ state, activeFile })
    })

    await sessionConfig!.config.sender({
      historyMsgs: [{ role: 'user', content: '读取组件目录' }],
      mode: 'multi',
      onDelta: vi.fn(),
      onSseEvent,
      onFcCall,
    })

    const firstRunArgs = shared.runLlm.mock.calls[0]
    if (!firstRunArgs) {
      throw new Error('expected runLlm to be called once')
    }
    const options = (firstRunArgs as unknown[])[1] as {
      onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
      onToolTurn?: (turn: unknown) => void
    }

    options.onSseEvent?.({ sessionId: 'sse-session', type: 'delta', data: 'raw delta' })
    options.onToolTurn?.({
      round: 3,
      timestamp: '2026-04-27T02:30:00.000Z',
      phase: 'stills-execute',
      toolBlock: { action: 'core@knowledge@queryPayloads', id: 'call-7', params: { category: 'layout' } },
      stillsResult: { ok: true, data: { count: 5 }, summary: 'container: 5 组件' },
      elapsed: 18,
    })

    expect(onSseEvent).toHaveBeenCalledWith({ sessionId: 'sse-session', type: 'delta', data: 'raw delta' })
    expect(onFcCall).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'core@knowledge@queryPayloads',
      args: { category: 'layout' },
      round: 3,
      callId: 'call-7',
      status: 'success',
      result: { count: 5 },
      durationMs: 18,
      timestamp: '2026-04-27T02:30:00.000Z',
    }))

    scope.stop()
  })

  it('wires FC error reporter with active page context', async () => {
    const { state } = createState()
    const scope = effectScope()
    const activeFile = ref<PageFileName | null>('pagedata.json')
    let sessionConfig: ReturnType<typeof useDevPageModelSession> | null = null

    scope.run(() => {
      sessionConfig = useDevPageModelSession({ state, activeFile })
    })

    await sessionConfig!.config.fcErrorReporter?.({
      id: 'fc-1',
      timestamp: '2026-04-27T03:00:00.000Z',
      toolName: 'core@knowledge@queryPayloads',
      args: { category: 'bad' },
      round: 1,
      status: 'error',
      error: 'INVALID_CATEGORY',
    })

    expect(reportAiFcErrorMock).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'core@knowledge@queryPayloads',
      status: 'error',
    }), expect.objectContaining({
      source: 'dev-page-model-session',
      pageId: 'orders-page',
      activeFile: 'pagedata.json',
      storageKey: 'devsystem-ai-chat:orders-page',
    }))

    scope.stop()
  })
})