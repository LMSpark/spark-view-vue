import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace, type PageNodeFileName } from '@spark-appworks/spark-project-model'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { preparePageDataDesignHostRun } from '@/services/page-data-design-host-run-provider'
import { readAiDeliveryErrorExtras } from '@/services/ai-delivery-port'

const mocks = vi.hoisted(() => {
  const createHeadlessPageDesignEditor = vi.fn()
  const delegateHost = {
    has: vi.fn(() => true),
    dryRun: vi.fn(),
    run: vi.fn(),
  }
  return {
    createHeadlessPageDesignEditor,
    delegateHost,
    ensurePageDataDesignBusiness: vi.fn(() => delegateHost),
  }
})

vi.mock('@/services/page-design-editor-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/page-design-editor-provider')>()
  return {
    ...actual,
    createHeadlessPageDesignEditor: mocks.createHeadlessPageDesignEditor,
  }
})

vi.mock('@/services/page-data-design-business', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/page-data-design-business')>()
  return {
    ...actual,
    ensurePageDataDesignBusiness: mocks.ensurePageDataDesignBusiness,
  }
})

class TestHttpClient extends HttpClientBase {
  protected async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {
    return { data: null, status: 200, statusText: 'OK', headers: {} }
  }
}

function createEditor(dirtyFileNames: readonly PageNodeFileName[] = ['pagedata.json']): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId: 'demo',
    http: new TestHttpClient(),
    getPageFilesApi: () => '/api/pages',
    getNavigationApi: () => '/api/navigation',
  })
  vi.spyOn(editor, 'selectPage').mockResolvedValue()
  vi.spyOn(editor, 'savePageFile').mockResolvedValue()
  vi.spyOn(editor.project, 'readDirtyProjection').mockReturnValue({
    dirtyFiles: new Set(dirtyFileNames),
    hasAnyFileDirty: dirtyFileNames.length > 0,
    navigationDirty: false,
    hasAnyDirty: dirtyFileNames.length > 0,
  })
  return editor
}

function createRunResult(): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: {
      sessionId: 'session-1',
      scope: {
        businessRegistrationId: 'pageDataDesign',
        businessInstanceId: 'orders',
      },
    } as never,
  }
}

function createDryRunResult(): AiAgentHostDryRunResult {
  return {
    ok: true,
    alias: 'pageDataDesign',
    moduleId: 'pageDataDesign',
    normalizedInput: {},
    scope: {} as never,
    orchestration: { userMessage: '补数据表', systemPrompt: '' },
    orchestrationSummary: { userMessageLength: 4, systemPromptLength: 0, readonlyStepCount: 0 },
    tools: [],
    inspectReport: {} as never,
    diagnostics: [],
  }
}

describe('preparePageDataDesignHostRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.delegateHost.has.mockReturnValue(true)
    mocks.delegateHost.dryRun.mockReturnValue(createDryRunResult())
    mocks.delegateHost.run.mockResolvedValue(createRunResult())
  })

  it('saves only pagedata.json and returns delivery artifacts after Host Run succeeds', async () => {
    const editor = createEditor(['pagedata.json', 'rule.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)

    const host = await preparePageDataDesignHostRun({
      requestId: 'request-1',
      alias: 'pageDataDesign',
      args: { pageId: 'orders', description: '补 CRUD 表', effectiveDescription: '订单列表需要主从表' },
      timestamp: Date.now(),
    }, {} as AiAgentHost)

    const result = await host.run('pageDataDesign', {} as AiJsonParams)

    expect(editor.selectPage).toHaveBeenCalledWith('orders', { forceReload: true })
    expect(editor.savePageFile).toHaveBeenCalledOnce()
    expect(editor.savePageFile).toHaveBeenCalledWith('pagedata.json')
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'saved',
      artifacts: [{ kind: 'page-file', name: 'pagedata.json', status: 'saved' }],
    })
  })

  it('skips save when pagedata.json is not dirty', async () => {
    const editor = createEditor(['rule.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)

    const host = await preparePageDataDesignHostRun({
      requestId: 'request-2',
      alias: 'pageDataDesign',
      args: { pageId: 'orders', description: 'noop', effectiveDescription: 'x' },
      timestamp: Date.now(),
    }, {} as AiAgentHost)

    const result = await host.run('pageDataDesign', {} as AiJsonParams)

    expect(editor.savePageFile).not.toHaveBeenCalled()
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'skipped',
      artifacts: [{ kind: 'page-file', name: 'pagedata.json', status: 'skipped' }],
    })
  })

  it('rolls back delivery extras when host run fails', async () => {
    const editor = createEditor(['pagedata.json'])
    mocks.createHeadlessPageDesignEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockRejectedValue(new Error('tool loop failed'))

    const host = await preparePageDataDesignHostRun({
      requestId: 'request-3',
      alias: 'pageDataDesign',
      args: { pageId: 'orders', description: 'fail', effectiveDescription: 'x' },
      timestamp: Date.now(),
    }, {} as AiAgentHost)

    let caught: unknown
    try {
      await host.run('pageDataDesign', {} as AiJsonParams)
    } catch (error: unknown) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(editor.savePageFile).not.toHaveBeenCalled()
    const extras = readAiDeliveryErrorExtras(caught)
    expect(extras?.delivery.status).toBe('rolledBack')
    expect(extras?.delivery.artifacts).toEqual([
      { kind: 'page-file', name: 'pagedata.json', status: 'rolledBack' },
    ])
  })

  it('passes through unrelated alias without wrapping host', async () => {
    const host = await preparePageDataDesignHostRun({
      requestId: 'request-4',
      alias: 'pageDesign',
      args: { pageId: 'orders' },
      timestamp: Date.now(),
    }, mocks.delegateHost as unknown as AiAgentHost)

    expect(host).toBe(mocks.delegateHost)
    expect(mocks.ensurePageDataDesignBusiness).not.toHaveBeenCalled()
  })
})
