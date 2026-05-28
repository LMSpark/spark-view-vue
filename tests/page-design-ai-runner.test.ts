import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageEditor } from '@spark-view/spark-page-config/editor'
import { createAiRunAdapter, type AiRunTraceSink } from '@spark-view/spark-app'
import type {
  AiAgentHostRunResult,
  AiAgentSessionRecord,
  AiAgentStreamEvent,
  AiAgentToolCallRecord,
} from '@spark-view/spark-ai/agent'
import { runPageDesignAiSession } from '@/services/page-design-ai-runner'

const mocks = vi.hoisted(() => {
  const aiAgentHostKey = Symbol('AI_AGENT_HOST')
  const pageDesignRun = vi.fn()
  return {
    aiAgentHostKey,
    pageDesignRun,
    ensurePageDesignBusiness: vi.fn(() => ({ run: pageDesignRun })),
  }
})

vi.mock('@spark-view/spark-ai/agent', () => ({
  AI_AGENT_HOST: mocks.aiAgentHostKey,
}))

vi.mock('@spark-view/spark-page-config/ai', () => ({
  PAGE_DESIGN_MODULE_ID: 'pageDesign',
  ensurePageDesignBusiness: mocks.ensurePageDesignBusiness,
}))

function createEditor(activePage: { pageId: string; isLoaded: boolean } | null): PageEditor {
  return {
    getActivePage: vi.fn(() => activePage),
    setActivePage: vi.fn(),
    ensureActivePageFilesLoaded: vi.fn(),
    createPageDesignEditHost: vi.fn(() => ({})),
  } as unknown as PageEditor
}

function createSessionRecord(instanceId = 'session-1'): AiAgentSessionRecord {
  return {
    moduleId: 'pageDesign',
    moduleInstanceId: 'orders',
    instanceId,
    runtimeInstanceId: 'runtime-1',
    status: 'Stopped',
    startedAt: 1,
    updatedAt: 2,
    history: [],
  }
}

function createRunResult(record = createSessionRecord()): AiAgentHostRunResult {
  return {
    task: {},
    session: {
      getSessionRecord: () => record,
    },
  } as unknown as AiAgentHostRunResult
}

function createStreamEvent(): AiAgentStreamEvent {
  return {
    type: 'delta',
    data: 'stream',
    turnKey: 'pageDesign:orders:turn-1',
    streamKey: 'pageDesign:orders:turn-1:stream-1',
    scope: {
      businessRegistrationId: 'pageDesign',
      businessInstanceId: 'orders',
      eventModuleId: 'pageDesign',
      turnId: 'turn-1',
    },
  }
}

function createToolCallRecord(): AiAgentToolCallRecord {
  return {
    toolName: 'writeNodeTree',
    args: { pageId: 'orders' },
    turnId: 'turn-1',
    round: 1,
    status: 'success',
    result: { ok: true, summary: 'updated' },
    durationMs: 12,
  }
}

function createTraceSink(): AiRunTraceSink {
  return {
    appendUserMessage: vi.fn(),
    appendEvent: vi.fn(),
    appendDelta: vi.fn(),
    appendReasoning: vi.fn(),
    appendToolCall: vi.fn(),
    appendError: vi.fn(),
    markAborted: vi.fn(),
    finish: vi.fn(),
    reset: vi.fn(),
  }
}

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve(value: T | PromiseLike<T>): void
  reject(reason?: unknown): void
}>

function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined
  let reject: ((reason?: unknown) => void) | undefined
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  if (resolve === undefined || reject === undefined) {
    throw new Error('Failed to create deferred promise.')
  }
  return { promise, resolve, reject }
}

describe('runPageDesignAiSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pageDesignRun.mockResolvedValue(createRunResult())
  })

  it('uses the already loaded active PageModel instead of loading files on AI click', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: true })
    const aiHost = {}
    const record = createSessionRecord('session-from-host')
    mocks.pageDesignRun.mockResolvedValue(createRunResult(record))

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: ((key: unknown) => key === mocks.aiAgentHostKey ? aiHost : null) as never,
    })

    expect(result).toEqual({ sawToolCall: false, sessionRecord: record })
    expect(editor.setActivePage).not.toHaveBeenCalled()
    expect(editor.ensureActivePageFilesLoaded).not.toHaveBeenCalled()
    expect(mocks.ensurePageDesignBusiness).toHaveBeenCalledWith(expect.objectContaining({ host: aiHost }))
    expect(mocks.pageDesignRun).toHaveBeenCalledWith('pageDesign', {
      pageId: 'orders',
      userRequirement: '补一个按钮',
    }, expect.any(Object))
  })

  it('wires pageDesign host callbacks through the headless AI run adapter', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: true })
    const aiHost = {}
    const event = createStreamEvent()
    const toolCall = createToolCallRecord()
    const record = createSessionRecord('session-with-stream')
    const trace = createTraceSink()
    const onSessionRecord = vi.fn()
    const events = {
      onReasoning: vi.fn(),
      onDelta: vi.fn(),
      onToolCall: vi.fn(),
      onStreamEvent: vi.fn(),
    }
    mocks.pageDesignRun.mockImplementation(async (_alias: string, _input: unknown, chat: {
      onStreamEvent?: (value: AiAgentStreamEvent) => void
      onDelta?: (value: string) => void
      onReasoning?: (value: string) => void
      onToolCall?: (value: AiAgentToolCallRecord) => void
    }) => {
      chat.onStreamEvent?.(event)
      chat.onDelta?.('delta text')
      chat.onReasoning?.('reasoning text')
      chat.onToolCall?.(toolCall)
      return createRunResult(record)
    })

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: ((key: unknown) => key === mocks.aiAgentHostKey ? aiHost : null) as never,
      trace,
      events,
      onSessionRecord,
    })

    expect(result).toEqual({ sawToolCall: true, sessionRecord: record })
    expect(trace.reset).toHaveBeenCalledTimes(1)
    expect(trace.appendUserMessage).toHaveBeenCalledWith('补一个按钮')
    expect(trace.appendEvent).toHaveBeenCalledWith(event)
    expect(trace.appendDelta).toHaveBeenCalledWith('delta text')
    expect(trace.appendReasoning).toHaveBeenCalledWith('reasoning text')
    expect(trace.appendToolCall).toHaveBeenCalledWith(toolCall)
    expect(trace.finish).toHaveBeenCalledTimes(1)
    expect(events.onStreamEvent).toHaveBeenCalledWith(event)
    expect(events.onDelta).toHaveBeenCalledWith('delta text')
    expect(events.onReasoning).toHaveBeenCalledWith('reasoning text')
    expect(events.onToolCall).toHaveBeenCalledWith(toolCall)
    expect(onSessionRecord).toHaveBeenNthCalledWith(1, null)
    expect(onSessionRecord).toHaveBeenNthCalledWith(2, record)
  })

  it('lets callers abort through an injected headless adapter', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: true })
    const aiHost = {}
    const adapter = createAiRunAdapter()
    const trace = createTraceSink()
    const onSessionRecord = vi.fn()
    const pending = createDeferred<AiAgentHostRunResult>()
    const lateRecord = createSessionRecord('late-session')
    let signal: AbortSignal | undefined
    mocks.pageDesignRun.mockImplementation((
      _alias: string,
      _input: unknown,
      chat: { signal?: AbortSignal },
    ) => {
      signal = chat.signal
      return pending.promise
    })

    const promise = runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: ((key: unknown) => key === mocks.aiAgentHostKey ? aiHost : null) as never,
      adapter,
      trace,
      onSessionRecord,
    })

    expect(adapter.isRunning()).toBe(true)
    adapter.abort('用户取消')
    expect(signal?.aborted).toBe(true)
    pending.resolve(createRunResult(lateRecord))

    await expect(promise).resolves.toEqual({ sawToolCall: false, sessionRecord: null })
    expect(trace.markAborted).toHaveBeenCalledWith('用户取消')
    expect(trace.appendError).not.toHaveBeenCalled()
    expect(onSessionRecord).toHaveBeenCalledTimes(1)
    expect(onSessionRecord).toHaveBeenCalledWith(null)
    expect(adapter.isRunning()).toBe(false)
  })

  it('fails fast when the active PageModel is not loaded', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: false })

    await expect(runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: (() => ({})) as never,
    })).rejects.toThrow('requires PageModel "orders" to be loaded')

    expect(editor.ensureActivePageFilesLoaded).not.toHaveBeenCalled()
  })
})
