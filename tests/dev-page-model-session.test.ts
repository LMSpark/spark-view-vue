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

vi.mock('../src/views/app/dev-system/composables/usePageModelSessionHost', () => ({
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

vi.mock('../src/views/app/dev-system/composables/useUnifiedEditSession', () => ({
  useUnifiedEditSession: () => ({
    bootstrap: shared.bootstrap,
    runLlm: shared.runLlm,
    reset: shared.reset,
    log: ref([]),
  }),
}))

import { useDevPageModelSession } from '../src/views/app/dev-system/composables/useDevPageModelSession'

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
    getLiveModelAdapter: vi.fn(() => ({})),
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

  it('bootstraps the live edit session when the AI panel opens', async () => {
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
})