import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watchEffect } from 'vue'
import { useDevState } from '@/views/app/dev-system/useDevState'
import { http } from '@/services/http'

const httpFns = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@spark-view/spark-app', () => ({
  refreshRoutes: vi.fn(),
}))

vi.mock('@/services/api-paths', () => ({
  getPageApi: () => '/api/pages-config',
  getNavApi: () => '/api/navigation',
}))

vi.mock('@/services/http', () => ({
  createAuthHeaders: () => ({}),
  http: httpFns,
}))

vi.mock('@spark-view/spark-page-config/editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-view/spark-page-config/editor')>()
  const { copyOwnEnumerableProperties, readProperty } = await import('@spark-view/spark-utils/internal')
  const requireRecord = (value: unknown, message: string): Record<string, unknown> => {
    const record = copyOwnEnumerableProperties(value)
    if (record !== null) return record
    throw new Error(message)
  }
  const isStatus = (error: unknown, status: number): boolean => {
    const directStatus = readProperty(error, 'status')
    const responseStatus = readProperty(readProperty(error, 'response'), 'status')
    return directStatus === status || responseStatus === status
  }
  const unsupported = async () => ({ success: false as const, error: 'unsupported', timestamp: Date.now() })
  const createTestConfigLoader = () => ({
      loadPageConfig: unsupported,
      loadRule: unsupported,
      loadPageData: unsupported,
      loadScript: unsupported,
      loadCss: unsupported,
      loadPageFile: unsupported,
      loadPageFileContent: async (pageId: string, filename: string) => {
        try {
          const data = requireRecord(
            await httpFns.get(`/api/pages-config/${pageId}/${filename}`),
            `Invalid page file response: ${pageId}/${filename}`,
          )
          return { success: true as const, data: String(data['content'] ?? ''), source: 'remote' as const, timestamp: Date.now() }
        } catch (error) {
          if ((filename === 'script.js' || filename === 'style.css') && isStatus(error, 404)) {
            return { success: true as const, data: '', source: 'remote' as const, timestamp: Date.now() }
          }
          return {
            success: false as const,
            error: error instanceof Error ? error.message : String(error),
            reason: isStatus(error, 404) ? 'not-found' : 'unknown',
            timestamp: Date.now(),
          }
        }
      },
      clearCache: vi.fn(),
      getCacheStats: () => ({ size: 0, keys: [] }),
      getHttpClient: () => undefined,
    }) 
  return {
    ...actual,
    createPageEditor: vi.fn((options: Parameters<typeof actual.createPageEditor>[0]) => actual.createPageEditor({
      ...options,
      createConfigLoader: () => createTestConfigLoader(),
    } as Parameters<typeof actual.createPageEditor>[0] & { createConfigLoader: () => ReturnType<typeof createTestConfigLoader> })),
  }
})

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

describe('DevState 页面文件闭环', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('缺失可选 script/style 不阻断四文件加载', async () => {
    const state = useDevState()
    state.selectPage('demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/script.js') || url.endsWith('/style.css')) throw notFound()
      return pageFileResponse(url)
    })

    await state.ensureActivePageFilesLoaded({ forceReload: true })

    expect(state.getActivePage()?.isLoaded).toBe(true)
    expect(state.getPageFileText('script.js')).toBe('')
    expect(state.getPageFileText('style.css')).toBe('')
  })

  it('缺失 rule/pagedata 以空文本进入编辑态，不写入占位内容', async () => {
    const state = useDevState()
    state.selectPage('demo')
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw notFound()
      if (url.endsWith('/pagedata.json')) throw notFound()
      return pageFileResponse(url)
    })

    await state.ensureActivePageFilesLoaded()

    expect(state.getActivePage()?.isLoaded).toBe(true)
    // V3.1: empty rule tree serializes to '[]\n'; empty DataSet serializes to its default JSON
    expect(state.getPageFileText('rule.json')).toBe('[]\n')
    expect(state.getPageFileText('pagedata.json')).not.toBe('')
  })

  it('版本 createdAt 接受后端数字毫秒并归一为 ISO 字符串', async () => {
    const state = useDevState()
    state.selectPage('demo')
    httpMock.get.mockResolvedValueOnce([
      { version: 1, createdAt: 1710000000000, isCurrent: true, modifiedBy: 'tester' },
    ])

    const versions = await state.listRemotePageVersions('script.js')

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
    const state = useDevState()
    state.selectPage('demo')
    state.getActivePage()!.script.setText('console.log("old")')
    httpMock.post.mockResolvedValueOnce({ ok: true })
    httpMock.get.mockImplementation(async (url: string) => pageFileResponse(url))

    const restored = await state.restoreRemotePageVersion(1, 'script.js')

    expect(restored).toBe(true)
    expect(state.getPageFileText('script.js')).toBe('console.log("restored")')
    expect(state.isDocumentDirty('script.js')).toBe(false)
    expect(state.pageFilesRevision.value).toBeGreaterThan(0)
  })

  it('切换左侧节点时触发右侧 navDraft 订阅刷新', async () => {
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
    const observedDraftIds: string[] = []
    const stop = watchEffect(() => {
      observedDraftIds.push(state.navDraft.id)
    })

    await state.selectNode(state.treeData.value[1]!)
    await nextTick()
    stop()

    expect(state.selectedNode.value?.id).toBe('beta-node')
    expect(state.activePageId.value).toBe('beta')
    expect(observedDraftIds.at(-1)).toBe('beta-node')
  })
})
