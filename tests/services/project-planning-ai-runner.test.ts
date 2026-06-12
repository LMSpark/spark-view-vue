import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectModel, ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  createAiRunAdapter,
  type AiRunAdapterState,
  type AiRunBeforeFunctionCall,
  type AiRunTraceSink,
} from '@spark-appworks/spark-app'
import type {
  AiAgentHost,
  AiAgentHostRunResult,
  AiAgentToolCallRecord,
  AiAgentTurnCallbacks,
} from '@spark-appworks/spark-ai/agent'
import { AI_AGENT_HOST, createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { HttpClientBase, type HttpResponse, type RequestConfig, type SparkCapabilityConsumer } from '@spark-appworks/spark-utils'
import { runProjectPlanningAiSession } from '@/services/project-planning/project-planning-ai-runner'

const mocks = vi.hoisted(() => {
  const projectPlanningRun = vi.fn()
  return {
    projectPlanningRun,
    ensureProjectPlanningBusiness: vi.fn(() => ({ run: projectPlanningRun })),
  }
})

vi.mock('@/services/project-planning/project-planning-business', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/project-planning/project-planning-business')>()
  return {
    ...actual,
    ensureProjectPlanningBusiness: mocks.ensureProjectPlanningBusiness,
  }
})

class TestHttpClient extends HttpClientBase {
  protected async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    return { data: null, status: 200, statusText: 'OK', headers: {} }
  }
}

function createEditor(projectId = 'demo'): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId,
    http: new TestHttpClient(),
    getPageFilesApi: () => '/api/pages',
    getNavigationApi: () => '/api/navigation',
  })
  seedPlanningProject(editor.project)
  return editor
}

function seedPlanningProject(project: ProjectModel): void {
  project.replaceNavigationRoot({
    id: 'homepage_root',
    title: 'Demo',
    nodeKind: 'module',
    childPlacement: 'header',
    description: '订单与库存管理',
    children: [
      {
        id: 'orders',
        title: '订单',
        nodeKind: 'page',
        path: '/orders',
        description: '订单页',
      },
    ],
  })
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

function createRunResult(sessionId = 'session-1'): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: { id: sessionId } as never,
  }
}

function createToolCallRecord(): AiAgentToolCallRecord {
  return {
    toolName: 'model_query',
    args: { kind: 'project' },
    turnId: 'turn-1',
    round: 1,
    status: 'success',
    result: { ok: true, summary: 'ok' },
    durationMs: 8,
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

describe('runProjectPlanningAiSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.projectPlanningRun.mockResolvedValue(createRunResult())
  })

  it('runs headless projectPlanning through host.run with scoped navigation input', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()

    const result = await runProjectPlanningAiSession({
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
    })

    expect(result.sawToolCall).toBe(false)
    expect(result.navigationDirty).toBe(false)
    expect(result.savedNavigation).toBe(false)
    expect(result.input).toEqual({
      projectScopeKey: 'demo',
      projectId: 'demo',
      requirement: '订单与库存管理',
      navigationNodes: [
        {
          nodeId: 'homepage_root',
          title: 'Demo',
          nodeKind: 'module',
          requirement: '订单与库存管理',
        },
        {
          nodeId: 'orders',
          title: '订单',
          nodeKind: 'page',
          requirement: '订单页',
        },
      ],
    })
    expect(mocks.ensureProjectPlanningBusiness).toHaveBeenCalledWith(expect.objectContaining({ host: aiHost }))
    expect(mocks.projectPlanningRun).toHaveBeenCalledWith('projectPlanning', result.input, expect.any(Object))
  })

  it('wires trace and tool call callbacks through the headless adapter', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()
    const toolCall = createToolCallRecord()
    const trace = createTraceSink()
    mocks.projectPlanningRun.mockImplementation(async (_alias: string, _input: unknown, chat: {
      onDelta?: (value: string) => void
      onToolCall?: (value: AiAgentToolCallRecord) => void
    }) => {
      chat.onDelta?.('delta')
      chat.onToolCall?.(toolCall)
      return createRunResult()
    })

    const result = await runProjectPlanningAiSession({
      editor,
      host: aiHost,
      trace,
    })

    expect(result.sawToolCall).toBe(true)
    expect(trace.appendUserMessage).toHaveBeenCalledWith('订单与库存管理')
    expect(trace.appendDelta).toHaveBeenCalledWith('delta')
    expect(trace.appendToolCall).toHaveBeenCalledWith(toolCall)
  })

  it('accepts injected adapter without rebinding business registration hooks', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()
    const beforeFunctionCall = vi.fn<AiRunBeforeFunctionCall>(() => ({ status: 'allow' }))
    const adapter: AiRunAdapterState = {
      isRunning: vi.fn(() => false),
      abort: vi.fn(),
      run: vi.fn(async () => 'completed' as const),
    }

    await runProjectPlanningAiSession({
      editor,
      consumeCapability: createCapabilityConsumer(aiHost),
      adapter,
      beforeFunctionCall,
    })

    expect(adapter.run).toHaveBeenCalledOnce()
    expect(mocks.ensureProjectPlanningBusiness).toHaveBeenCalledWith(expect.objectContaining({ host: aiHost }))
  })

  it('can inject host directly without capability lookup', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()

    await runProjectPlanningAiSession({
      editor,
      host: aiHost,
      adapter: createAiRunAdapter(),
    })

    expect(mocks.projectPlanningRun).toHaveBeenCalledOnce()
  })

  it('saves navigation through delivery when saveNavigationAfterRun is true', async () => {
    const editor = createEditor('demo')
    const aiHost = createAiHost()
    const saveAll = vi.spyOn(editor, 'saveAll').mockResolvedValue()
    editor.project.replaceNavigationChildren([
      {
        id: 'orders',
        title: '订单',
        nodeKind: 'page',
        path: '/orders',
        description: '订单页',
      },
    ])

    const result = await runProjectPlanningAiSession({
      editor,
      host: aiHost,
      saveNavigationAfterRun: true,
    })

    expect(saveAll).toHaveBeenCalledOnce()
    expect(result.navigationDirty).toBe(true)
    expect(result.savedNavigation).toBe(true)
  })
})
