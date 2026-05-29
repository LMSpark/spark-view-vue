import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageEditor, type PageEditor } from '@spark-view/spark-page-config/editor'
import {
  createAiRunAdapter,
  type AiRunAdapterState,
  type AiRunBeforeFunctionCall,
  type AiRunTraceSink,
} from '@spark-view/spark-app'
import type {
  AiAgentHost,
  AiAgentHostRunResult,
  AiAgentStreamEvent,
  AiAgentTurnCallbacks,
  AiAgentToolCallRecord,
} from '@spark-view/spark-ai/agent'
import {
  AiAgentRegistration,
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentSession,
  AiAgentTarget,
  AiAgentTask,
  createAiAgentHost,
  DefaultAiAgentSessionStore,
} from '@spark-view/spark-ai/agent'
import { AiModuleRuntime } from '@spark-view/spark-ai/modules'
import { HttpClientBase, type HttpResponse, type RequestConfig, type SparkCapabilityConsumer } from '@spark-view/spark-utils'
import { runPageDesignAiSession } from '@/services/page-design-ai-runner'

const mocks = vi.hoisted(() => {
  const pageDesignRun = vi.fn()
  return {
    pageDesignRun,
    ensurePageDesignBusiness: vi.fn(() => ({ run: pageDesignRun })),
  }
})

vi.mock('@spark-view/spark-page-config/ai', () => ({
  PAGE_DESIGN_MODULE_ID: 'pageDesign',
  ensurePageDesignBusiness: mocks.ensurePageDesignBusiness,
}))

class TestHttpClient extends HttpClientBase {
  protected async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    return { data: null, status: 200, statusText: 'OK', headers: {} }
  }
}

type ActivePageState = Readonly<{
  pageId: string
  isLoaded: boolean
}>

function createEditor(activePage: ActivePageState | null): PageEditor {
  const editor = createPageEditor({
    http: new TestHttpClient(),
    getPageConfigApi: () => '/api/pages',
    getNavigationApi: () => '/api/navigation',
  })
  Object.defineProperty(editor, 'getActivePage', {
    value: vi.fn(() => activePage),
    configurable: true,
  })
  Object.defineProperty(editor, 'setActivePage', {
    value: vi.fn(),
    configurable: true,
  })
  Object.defineProperty(editor, 'ensureActivePageFilesLoaded', {
    value: vi.fn(),
    configurable: true,
  })
  Object.defineProperty(editor, 'createPageDesignEditHost', {
    value: vi.fn(() => ({})),
    configurable: true,
  })
  return editor
}

function createAiHost(): AiAgentHost {
  const turnCallbacks: AiAgentTurnCallbacks = {
    executeTurn: async () => ({ text: '', toolCalls: [] }),
    appendMessages: async () => undefined,
  }
  return createAiAgentHost({ turnCallbacks })
}

function createCapabilityConsumer(host: AiAgentHost): SparkCapabilityConsumer {
  return (name) => name.read(host)
}

function createRunResult(instanceId = 'orders'): AiAgentHostRunResult {
  const moduleId = 'pageDesign'
  const store = new DefaultAiAgentSessionStore({ now: () => 1 })
  const context = new AiAgentRuntimeContext(moduleId, instanceId, instanceId)
  store.startSession(context)
  const registration = new AiAgentRegistration({
    moduleId,
    name: '页面设计',
    description: '页面设计',
    runtime: new AiModuleRuntime(),
    sessionStore: store,
  })
  const registry = {
    get: (requestedModuleId: string) =>
      requestedModuleId === moduleId ? registration : undefined,
  }
  const turnCallbacks: AiAgentTurnCallbacks = {
    executeTurn: async () => ({ text: '', toolCalls: [] }),
    appendMessages: async () => undefined,
  }
  const scope = new AiAgentScope(moduleId, instanceId, instanceId, instanceId)
  const task = new AiAgentTask(moduleId, {
    pageId: instanceId,
    userRequirement: '补一个按钮',
  }, scope, {
    userMessage: '补一个按钮',
    systemPrompt: '页面设计',
  })
  const session = new AiAgentSession(
    { registry, turnCallbacks },
    new AiAgentTarget(moduleId, instanceId),
  )
  return { task, session }
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
    const aiHost = createAiHost()
    const runResult = createRunResult('session-from-host')
    mocks.pageDesignRun.mockResolvedValue(runResult)

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
    })

    expect(result).toEqual({ sawToolCall: false })
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
    const aiHost = createAiHost()
    const event = createStreamEvent()
    const toolCall = createToolCallRecord()
    const runResult = createRunResult('session-with-stream')
    const trace = createTraceSink()
    const beforeFunctionCall = vi.fn<AiRunBeforeFunctionCall>(() => ({ status: 'allow' }))
    const events = {
      onToolCall: vi.fn(),
      onStreamEvent: vi.fn(),
    }
    mocks.pageDesignRun.mockImplementation(async (_alias: string, _input: unknown, chat: {
      onStreamEvent?: (value: AiAgentStreamEvent) => void
      onDelta?: (value: string) => void
      onReasoning?: (value: string) => void
      onToolCall?: (value: AiAgentToolCallRecord) => void
      beforeFunctionCall?: AiRunBeforeFunctionCall
    }) => {
      expect(chat.beforeFunctionCall).toBe(beforeFunctionCall)
      chat.onStreamEvent?.(event)
      chat.onDelta?.('delta text')
      chat.onReasoning?.('reasoning text')
      chat.onToolCall?.(toolCall)
      return runResult
    })

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
      trace,
      events,
      beforeFunctionCall,
    })

    expect(result).toEqual({ sawToolCall: true })
    expect(trace.reset).toHaveBeenCalledTimes(1)
    expect(trace.appendUserMessage).toHaveBeenCalledWith('补一个按钮')
    expect(trace.appendEvent).toHaveBeenCalledWith(event)
    expect(trace.appendDelta).toHaveBeenCalledWith('delta text')
    expect(trace.appendReasoning).toHaveBeenCalledWith('reasoning text')
    expect(trace.appendToolCall).toHaveBeenCalledWith(toolCall)
    expect(trace.finish).toHaveBeenCalledTimes(1)
    expect(events.onStreamEvent).toHaveBeenCalledWith(event)
    expect(events.onToolCall).toHaveBeenCalledWith(toolCall)
  })

  it('passes approval hooks to an injected adapter without binding them to pageDesign business registration', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: true })
    const aiHost = createAiHost()
    const beforeFunctionCall = vi.fn<AiRunBeforeFunctionCall>(() => ({ status: 'allow' }))
    const onAbort = vi.fn()
    const runResult = createRunResult('adapter-session')
    const adapter: AiRunAdapterState = {
      isRunning: vi.fn(() => false),
      abort: vi.fn(),
      run: vi.fn(async (command) => {
        expect(command.beforeFunctionCall).toBe(beforeFunctionCall)
        expect(command.onAbort).toBe(onAbort)
        void runResult
        return 'completed' as const
      }),
    }

    const result = await runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
      adapter,
      beforeFunctionCall,
      onAbort,
    })

    expect(result).toEqual({ sawToolCall: false })
    expect(adapter.run).toHaveBeenCalledOnce()
    expect(mocks.ensurePageDesignBusiness).toHaveBeenCalledWith(expect.objectContaining({ host: aiHost }))
  })

  it('lets callers abort through an injected headless adapter', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: true })
    const aiHost = createAiHost()
    const adapter = createAiRunAdapter()
    const trace = createTraceSink()
    const pending = createDeferred<AiAgentHostRunResult>()
    const lateResult = createRunResult('late-session')
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
      consumeCapability: createCapabilityConsumer(aiHost),
      adapter,
      trace,
    })

    expect(adapter.isRunning()).toBe(true)
    adapter.abort('用户取消')
    expect(signal?.aborted).toBe(true)
    pending.resolve(lateResult)

    await expect(promise).resolves.toEqual({ sawToolCall: false })
    expect(trace.markAborted).toHaveBeenCalledWith('用户取消')
    expect(trace.appendError).not.toHaveBeenCalled()
    expect(adapter.isRunning()).toBe(false)
  })

  it('fails fast when the active PageModel is not loaded', async () => {
    const editor = createEditor({ pageId: 'orders', isLoaded: false })
    const aiHost = createAiHost()

    await expect(runPageDesignAiSession({
      pageId: 'orders',
      userRequirement: '补一个按钮',
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
    })).rejects.toThrow('requires PageModel "orders" to be loaded')

    expect(editor.ensureActivePageFilesLoaded).not.toHaveBeenCalled()
  })
})
