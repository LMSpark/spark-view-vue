import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import type {
  AiAgentHost,
  AiAgentHostDryRunResult,
  AiAgentHostRunResult,
} from '@spark-appworks/spark-ai/agent'
import type { AiJsonParams } from '@spark-appworks/spark-ai/json'
import { HttpClientBase, type HttpResponse, type RequestConfig } from '@spark-appworks/spark-utils'
import { prepareProjectPlanningHostRun } from '@/services/project-planning-host-run-provider'
import { readAiDeliveryErrorExtras } from '@/services/ai-delivery-port'

const mocks = vi.hoisted(() => {
  const createHeadlessProjectPlanningEditor = vi.fn()
  const delegateHost = {
    has: vi.fn(() => true),
    dryRun: vi.fn(),
    run: vi.fn(),
  }
  return {
    createHeadlessProjectPlanningEditor,
    delegateHost,
    ensureProjectPlanningBusiness: vi.fn(() => delegateHost),
  }
})

vi.mock('@/services/project-planning-editor-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/project-planning-editor-provider')>()
  return {
    ...actual,
    createHeadlessProjectPlanningEditor: mocks.createHeadlessProjectPlanningEditor,
  }
})

vi.mock('@/services/project-planning-business', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/project-planning-business')>()
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

function createEditor(projectId = 'hr-enterprise-planning-smoke'): ProjectWorkspace {
  const editor = new ProjectWorkspace({
    projectId,
    http: new TestHttpClient(),
    getPageFilesApi: () => '/api/pages',
    getNavigationApi: () => '/api/navigation',
  })
  editor.project.replaceNavigationRoot({
    id: 'root',
    title: 'Root',
    nodeKind: 'module',
    childPlacement: 'header',
    description: '默认项目需求',
    children: [
      {
        id: 'people',
        title: 'People',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ],
  })
  vi.spyOn(editor, 'loadNavigation').mockResolvedValue(editor.project.navigationRoot)
  vi.spyOn(editor, 'saveAll').mockResolvedValue()
  return editor
}

function createRunResult(): AiAgentHostRunResult {
  return {
    task: { toChatRequest: () => ({ messages: [] }) } as never,
    session: {
      sessionId: 'session-1',
      scope: {
        businessRegistrationId: 'projectPlanning',
        businessInstanceId: 'lmspark:hr-enterprise-planning-smoke',
      },
    } as never,
  }
}

function createDryRunResult(): AiAgentHostDryRunResult {
  return {
    ok: true,
    alias: 'projectPlanning',
    moduleId: 'projectPlanning',
    normalizedInput: {},
    scope: {} as never,
    orchestration: { userMessage: '需求', systemPrompt: '' },
    orchestrationSummary: { userMessageLength: 2, systemPromptLength: 0, readonlyStepCount: 0 },
    tools: [],
    inspectReport: {} as never,
    diagnostics: [],
  }
}

describe('prepareProjectPlanningHostRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.delegateHost.has.mockReturnValue(true)
    mocks.delegateHost.dryRun.mockReturnValue(createDryRunResult())
    mocks.delegateHost.run.mockResolvedValue(createRunResult())
  })

  it('normalizes tenant-scoped Host Run args into app tool input', async () => {
    const editor = createEditor()
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    const args = {
      tenantId: 'lmspark',
      projectId: 'hr-enterprise-planning-smoke',
      requirement: '产品需求',
      saveNavigationAfterRun: false,
    }

    const host = await prepareProjectPlanningHostRun({
      requestId: 'request-1',
      alias: 'projectPlanning',
      args,
      timestamp: Date.now(),
    }, {} as AiAgentHost)

    host.dryRun('projectPlanning', args as AiJsonParams)

    expect(mocks.createHeadlessProjectPlanningEditor).toHaveBeenCalledWith({
      tenantId: 'lmspark',
      projectId: 'hr-enterprise-planning-smoke',
    })
    expect(mocks.delegateHost.dryRun).toHaveBeenCalledWith('projectPlanning', {
      projectScopeKey: 'lmspark:hr-enterprise-planning-smoke:request-1',
      projectId: 'hr-enterprise-planning-smoke',
      requirement: '产品需求',
      navigationNodes: [
        {
          nodeId: 'root',
          title: 'Root',
          nodeKind: 'module',
          requirement: '默认项目需求',
        },
        {
          nodeId: 'people',
          title: 'People',
          nodeKind: 'page',
          requirement: 'People page',
        },
      ],
    })
  })

  it('does not save navigation unless Host Run args explicitly request it', async () => {
    const editor = createEditor()
    editor.project.replaceNavigationChildren([
      {
        id: 'people',
        title: 'People',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)

    const host = await prepareProjectPlanningHostRun({
      requestId: 'request-2',
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
      },
      timestamp: Date.now(),
    }, {} as AiAgentHost)

    const result = await host.run('projectPlanning', {} as AiJsonParams)

    expect(editor.saveAll).not.toHaveBeenCalled()
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'skipped',
      artifacts: [{ kind: 'navigation', name: 'navigation', status: 'skipped' }],
    })
  })

  it('saves navigation only when saveNavigationAfterRun is true', async () => {
    const editor = createEditor()
    editor.project.replaceNavigationChildren([
      {
        id: 'people',
        title: 'People',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)

    const host = await prepareProjectPlanningHostRun({
      requestId: 'request-3',
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
        saveNavigationAfterRun: true,
      },
      timestamp: Date.now(),
    }, {} as AiAgentHost)

    const result = await host.run('projectPlanning', {} as AiJsonParams)

    expect(editor.saveAll).toHaveBeenCalledOnce()
    expect(result.resultExtras?.['delivery']).toEqual({
      mode: 'auto',
      status: 'saved',
      artifacts: [{ kind: 'navigation', name: 'navigation', status: 'saved' }],
    })
    expect(result.resultExtras?.['projectPlanning']).toEqual(expect.objectContaining({
      savedNavigation: true,
    }))
  })

  it('rolls back delivery metadata when run fails', async () => {
    const editor = createEditor()
    editor.project.replaceNavigationChildren([
      {
        id: 'people',
        title: 'People',
        nodeKind: 'page',
        path: '/people',
        description: 'People page',
      },
    ])
    mocks.createHeadlessProjectPlanningEditor.mockReturnValue(editor)
    mocks.delegateHost.run.mockRejectedValue(new Error('run failed'))

    const host = await prepareProjectPlanningHostRun({
      requestId: 'request-rollback',
      alias: 'projectPlanning',
      args: {
        tenantId: 'lmspark',
        projectId: 'hr-enterprise-planning-smoke',
        requirement: '产品需求',
        saveNavigationAfterRun: true,
      },
      timestamp: Date.now(),
    }, {} as AiAgentHost)

    let thrown: unknown
    try {
      await host.run('projectPlanning', {} as AiJsonParams)
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect(editor.saveAll).not.toHaveBeenCalled()
    expect(readAiDeliveryErrorExtras(thrown)?.delivery).toEqual({
      mode: 'auto',
      status: 'rolledBack',
      artifacts: [{ kind: 'navigation', name: 'navigation', status: 'rolledBack' }],
      message: 'run failed',
    })
  })

  it('fails fast when tenantId is missing', async () => {
    await expect(prepareProjectPlanningHostRun({
      requestId: 'request-4',
      alias: 'projectPlanning',
      args: {
        projectId: 'hr-enterprise-planning-smoke',
      },
      timestamp: Date.now(),
    }, {} as AiAgentHost)).rejects.toThrow(/tenantId/u)
  })
})
