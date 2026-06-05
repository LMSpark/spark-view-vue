import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watchEffect } from 'vue'
import { useDevState } from '@/views/app/dev-system/useDevState'
import {
  createDevStateWithConfigPages,
  DEMO_PAGE_FIXTURE,
  ensureDevStateActivePageLoaded,
  isolateAppProjectEditorForTest,
  isDevStatePageDocumentDirty,
} from './dev-state-test-fixture'
import type { ProjectModelData } from '@spark-appworks/spark-project-model'
import { refreshRoutes } from '@spark-appworks/spark-app'
import { http } from '@/services/http'

const httpFns = vi.hoisted(() => ({
  get: vi.fn(),
  requestFull: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  clearCache: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))

const navTreeState = vi.hoisted(() => ({
  tree: null as ProjectModelData | null,
}))

vi.mock('@spark-appworks/spark-app', () => ({
  getNavTree: vi.fn(() => navTreeState.tree),
  refreshRoutes: vi.fn(async () => {
    if (navTreeState.tree) return navTreeState.tree
    throw new Error('refreshRoutes: no nav tree')
  }),
  createAiRunAdapter: vi.fn(() => ({
    isRunning: vi.fn(() => false),
    abort: vi.fn(),
    run: vi.fn(async () => 'completed' as const),
  })),
  createAiToolApprovalBridge: vi.fn(() => ({
    beforeFunctionCall: vi.fn(async () => ({ status: 'allow' })),
    cancelPending: vi.fn(() => 0),
    decide: vi.fn(() => false),
    listPending: vi.fn(() => []),
    subscribe: vi.fn((listener: (snapshot: { pending: [] }) => void) => {
      listener({ pending: [] })
      return vi.fn()
    }),
  })),
}))

vi.mock('@/services/api-paths', () => ({
  getPageApi: () => '/api/pages-config',
  getNavApi: () => '/api/navigation',
  getProjectApi: () => '/api/projects',
  getProjectNavigationApi: (projectId: string) => `/api/projects/${projectId}/navigation`,
}))

vi.mock('@/services/http', () => ({
  createAuthHeaders: () => ({}),
  http: httpFns,
}))

const httpMock = vi.mocked(http)

function notFound(): Error & { response: { status: number } } {
  return Object.assign(new Error('not found'), { response: { status: 404 } })
}

function pageFileResponse(url: string): Record<string, unknown> {
  if (url.endsWith('/rule.json')) return { content: '[]' }
  if (url.endsWith('/pagedata.json')) return { content: '{"dataSetName":"TestDS","tables":{}}' }
  if (url.endsWith('/script.js')) return { content: 'console.log("restored")' }
  if (url.endsWith('/style.css')) return { content: '.restored { color: red; }' }
  return { content: '' }
}

async function requestFullFromGet(config: { url: string }): Promise<Record<string, unknown>> {
  try {
    const data = await httpFns.get(config.url)
    const content = data !== null && typeof data === 'object'
      ? Object.getOwnPropertyDescriptor(data, 'content')?.value
      : ''
    return {
      data: {
        protocolVersion: 4,
        ok: true,
        data: {
          content: String(content ?? ''),
          timestamp: '1',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  } catch (error) {
    if (
      isErrorLike(error) &&
      error.status === undefined &&
      typeof error.response?.status === 'number'
    ) {
      error.status = error.response.status
    }
    throw error
  }
}

function isErrorLike(value: unknown): value is { status?: unknown; response?: { status?: unknown } } {
  return value !== null && typeof value === 'object'
}

describe('DevState 页面文件闭环', () => {
  beforeEach(() => {
    isolateAppProjectEditorForTest()
    vi.clearAllMocks()
    httpFns.requestFull.mockImplementation(requestFullFromGet)
    httpFns.clearCache.mockImplementation(() => undefined)
    httpFns.interceptors.request.use.mockImplementation(() => () => undefined)
    httpFns.interceptors.response.use.mockImplementation(() => () => undefined)
  })

  it('缺失 script/style 时 fail-fast，不静默写入空文档', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/script.js') || url.endsWith('/style.css')) throw notFound()
      return pageFileResponse(url)
    })

    await expect(ensureDevStateActivePageLoaded(state, { forceReload: true })).rejects.toThrow('not found')

    expect(state.editor.getActivePage()?.isLoaded).toBe(false)
  })

  it('缺失 rule/pagedata 时 fail-fast，不创建占位模型', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw notFound()
      if (url.endsWith('/pagedata.json')) throw notFound()
      return pageFileResponse(url)
    })

    await expect(ensureDevStateActivePageLoaded(state)).rejects.toThrow('not found')

    expect(state.editor.getActivePage()?.isLoaded).toBe(false)
  })

  it('版本 createdAt 接受后端数字毫秒并归一为 ISO 字符串', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    httpMock.get.mockResolvedValueOnce([
      { version: 1, createdAt: 1710000000000, isCurrent: true, modifiedBy: 'tester' },
    ])

    state.editor.setActivePage(state.activePageId.value)
    const versions = await state.editor.listRemotePageVersions('script.js')

    expect(versions).toEqual([
      {
        version: 1,
        createdAt: new Date(1710000000000).toISOString(),
        isCurrent: true,
        modifiedBy: 'tester',
      },
    ])
  })

  it('restore 后立即强制重读并回填文档模型', async () => {
    const state = createDevStateWithConfigPages(DEMO_PAGE_FIXTURE, 'demo')
    state.editor.setPageFileText('script.js', 'console.log("old")')
    httpMock.post.mockResolvedValueOnce({ ok: true })
    httpMock.get.mockImplementation(async (url: string) => pageFileResponse(url))

    state.editor.setActivePage('demo')
    await state.editor.restoreRemotePageVersion(1, 'script.js')
    expect(state.editor.getPageFileText('script.js')).toBe('console.log("restored")')
    expect(isDevStatePageDocumentDirty(state, 'script.js')).toBe(false)
    expect(state.pageFilesRevision.value).toBeGreaterThan(0)
  })

  it('切换左侧节点时触发右侧 navEditDto 订阅刷新', async () => {
    const state = useDevState()
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/navigation') {
        return {
          title: 'root',
          childPlacement: 'header',
          children: [
            { id: 'alpha-node', title: 'Alpha', nodeKind: 'page', path: '/alpha' },
            { id: 'beta-node', title: 'Beta', nodeKind: 'page', path: '/beta' },
          ],
        }
      }
      return pageFileResponse(url)
    })

    await state.loadNavConfig()
    const observedEditDtoIds: string[] = []
    const stop = watchEffect(() => {
      observedEditDtoIds.push(state.navEditDto.id)
    })

    await state.selectNode(state.treeData.value[1]!)
    await nextTick()
    stop()

    expect(state.selectedNode.value?.id).toBe('beta-node')
    expect(state.activePageId.value).toBe('beta')
    expect(observedEditDtoIds.at(-1)).toBe('beta-node')
  })

  it('初始化页面列表从导航树派生，不请求 pages-config __list', async () => {
    const state = useDevState()
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/navigation') {
        return {
          title: 'root',
          childPlacement: 'header',
          children: [
            { id: 'alpha-node', title: 'Alpha', nodeKind: 'page', path: '/alpha', icon: 'Document', description: 'Alpha 页面需求' },
            { id: 'sys-node', title: 'System', nodeKind: 'system-page', path: '/system' },
          ],
        }
      }
      if (url.includes('/__list')) {
        throw new Error(`unexpected GET ${url}`)
      }
      return pageFileResponse(url)
    })

    await state.initialize()

    expect(state.pageList.value).toEqual([
      expect.objectContaining({
        pageId: 'alpha',
        path: '/alpha',
        title: 'Alpha',
        nodeId: 'alpha-node',
        description: 'Alpha 页面需求',
        designSurface: 'config-files',
      }),
      expect.objectContaining({
        pageId: 'system',
        path: '/system',
        title: 'System',
        nodeId: 'sys-node',
        designSurface: 'vue-component',
      }),
    ])
    expect(httpMock.get).not.toHaveBeenCalledWith('/api/pages-config/__list')
  })

  it('header 保存导航属性时只提交选中节点 patch，不整树保存', async () => {
    const state = useDevState()
    const root: ProjectModelData = {
      title: 'root',
      childPlacement: 'header',
      children: [
        { id: 'alpha-node', title: 'Alpha', nodeKind: 'page', path: '/alpha' },
      ],
    }
    navTreeState.tree = root
    httpMock.get.mockImplementation(async (url: string) => {
      if (url === '/api/navigation') return root
      return pageFileResponse(url)
    })
    httpMock.put.mockResolvedValueOnce({
      node: { id: 'alpha-node', title: 'Alpha updated', nodeKind: 'page', path: '/alpha' },
    })

    vi.mocked(refreshRoutes).mockImplementation(async (): Promise<ProjectModelData> => {
      const updated: ProjectModelData = {
        ...root,
        children: [
          { id: 'alpha-node', title: 'Alpha updated', nodeKind: 'page', path: '/alpha' },
        ],
      }
      navTreeState.tree = updated
      return updated
    })

    await state.loadNavConfig()
    state.navEditDto.title = 'Alpha updated'
    const refreshCallsBeforeSave = vi.mocked(refreshRoutes).mock.calls.length

    await state.saveAll()

    expect(vi.mocked(refreshRoutes).mock.calls.length - refreshCallsBeforeSave).toBe(1)
    expect(navTreeState.tree?.children?.[0]?.title).toBe('Alpha updated')
    expect(state.editor.readSnapshot().treeData[0]?.title).toBe('Alpha updated')

    expect(httpMock.put).toHaveBeenCalledWith(
      '/api/navigation/nodes/alpha-node',
      expect.objectContaining({ title: 'Alpha updated', order: 0 }),
    )
    expect(httpMock.put).not.toHaveBeenCalledWith('/api/navigation/nodes/alpha-node/move', expect.anything())
    expect(httpMock.put).not.toHaveBeenCalledWith('/api/navigation', expect.anything())
    expect(httpMock.post).not.toHaveBeenCalledWith('/api/navigation', expect.anything())
  })
})
