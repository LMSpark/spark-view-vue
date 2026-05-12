import { effectScope, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDevState } from '@/views/app/dev-system/useDevState'
import { useDevFileEditor } from '@/views/app/dev-system/composables/useDevFileEditor'
import type { PageConfigFileName, PageConfigFileVersionSummary } from '@spark-view/spark-page-config'

const { httpFns, pageConfigWorkspaceDataService } = vi.hoisted(() => {
  const httpFns = {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  }
  const pageApi = '/api/tenants/t1/projects/p1/pages-config'
  const navApi = '/api/tenants/t1/projects/p1/navigation'
  const fileNames = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
  type FileName = typeof fileNames[number]
  const isStatus = (error: unknown, status: number): boolean => {
    if (error === null || typeof error !== 'object') return false
    const candidate = error as { status?: unknown; response?: { status?: unknown } }
    return candidate.status === status || candidate.response?.status === status
  }
  const readFileText = async (
    pageId: string,
    filename: FileName,
    options?: { missing?: 'throw' | 'empty' },
  ): Promise<string> => {
    try {
      const data = await httpFns.get(`${pageApi}/${pageId}/${filename}`) as Record<string, unknown>
      return String(data['content'] ?? '')
    } catch (error) {
      if (options?.missing === 'empty' && isStatus(error, 404)) return ''
      const reason = isStatus(error, 404) ? 'not-found' : 'unknown'
      throw new Error(`读取页面文件失败: ${pageId}/${filename} (${reason})`)
    }
  }
  const normalizeCreatedAt = (value: unknown): string => {
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
    if (typeof value !== 'string' || value.trim() === '') return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }
  const normalizeVersion = (item: Record<string, unknown>): PageConfigFileVersionSummary => ({
    version: Number(item['version'] ?? 0),
    createdAt: normalizeCreatedAt(item['createdAt']),
    isCurrent: item['isCurrent'] === true,
    modifiedBy: typeof item['modifiedBy'] === 'string' ? item['modifiedBy'] : null,
  })
  return {
    httpFns,
    pageConfigWorkspaceDataService: {
      pageConfig: {
        listPages: () => httpFns.get(`${pageApi}/__list`),
        readFileText,
        readFiles: async (pageId: string, options?: { missing?: 'throw' | 'empty' }) => Object.fromEntries(
          await Promise.all(fileNames.map(async filename => [
            filename,
            await readFileText(pageId, filename, options),
          ])),
        ),
        saveFileContent: (pageId: string, filename: FileName, content: string) =>
          httpFns.put(`${pageApi}/${pageId}/${filename}`, content, { headers: { 'Content-Type': 'text/plain' } }),
        listFileVersions: async (pageId: string, filename: FileName) => {
          const rows = await httpFns.get(`${pageApi}/${pageId}/${filename}/__versions`) as Array<Record<string, unknown>>
          return rows.map(normalizeVersion).filter(item => item.version > 0)
        },
        restoreFileVersion: (pageId: string, filename: FileName, version: number) =>
          httpFns.post(`${pageApi}/${pageId}/${filename}/__versions/${version}/__restore`, {}),
        createFileVersion: (pageId: string, filename: FileName) =>
          httpFns.post(`${pageApi}/${pageId}/${filename}/__versions`, {}),
        deleteFileVersion: (pageId: string, filename: FileName, version: number) =>
          httpFns.delete(`${pageApi}/${pageId}/${filename}/__versions/${version}`),
        clearCache: vi.fn(),
      },
      navigation: {
        loadConfig: () => httpFns.get(navApi),
        saveConfig: (root: unknown) => httpFns.put(navApi, root),
        saveNode: (nodeId: string, patch: unknown) => httpFns.put(`${navApi}/nodes/${encodeURIComponent(nodeId)}`, patch),
        createNode: (input: unknown) => httpFns.post(`${navApi}/nodes`, input),
        deleteNode: (nodeId: string) => httpFns.delete(`${navApi}/nodes/${encodeURIComponent(nodeId)}`),
        probeLinkTarget: async (url: string) => {
          const result = await httpFns.post(`${navApi}/link-probe`, { url }) as Record<string, unknown>
          return { embeddable: Boolean(result['embeddable']), reason: String(result['reason'] ?? '') }
        },
      },
    },
  }
})

vi.mock('@/services/page-config-workspace-data-service', () => ({
  pageConfigWorkspaceDataService,
}))

const httpMock = httpFns

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
    state.activePageId.value = 'demo'
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/script.js') || url.endsWith('/style.css')) throw notFound()
      return pageFileResponse(url)
    })

    await state.ensureActivePageFilesLoaded({ forceReload: true })

    expect(state.documents['rule.json'].loadState.value).toBe('loaded')
    expect(state.documents['pagedata.json'].loadState.value).toBe('loaded')
    expect(state.documents['script.js'].loadState.value).toBe('loaded')
    expect(state.documents['style.css'].loadState.value).toBe('loaded')
    expect(state.documents['script.js'].text.value).toBe('')
    expect(state.documents['style.css'].text.value).toBe('')
  })

  it('缺失 rule/pagedata 以空文本进入编辑态，不写入占位内容', async () => {
    const state = useDevState()
    state.activePageId.value = 'demo'
    httpMock.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw notFound()
      if (url.endsWith('/pagedata.json')) throw notFound()
      return pageFileResponse(url)
    })

    await state.ensureActivePageFilesLoaded()

    expect(state.documents['rule.json'].loadState.value).toBe('loaded')
    expect(state.documents['pagedata.json'].loadState.value).toBe('loaded')
    expect(state.documents['rule.json'].text.value).toBe('')
    expect(state.documents['pagedata.json'].text.value).toBe('')
  })

  it('版本 createdAt 接受后端数字毫秒并归一为 ISO 字符串', async () => {
    const state = useDevState()
    state.activePageId.value = 'demo'
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
    state.activePageId.value = 'demo'
    state.documents['script.js'].loadFromText('console.log("old")', { markSaved: true })
    httpMock.post.mockResolvedValueOnce({ ok: true })
    httpMock.get.mockImplementation(async (url: string) => pageFileResponse(url))

    const restored = await state.restoreRemotePageVersion(1, 'script.js')

    expect(restored).toBe(true)
    expect(state.documents['script.js'].text.value).toBe('console.log("restored")')
    expect(state.isDocumentDirty('script.js')).toBe(false)
    expect(state.pageFilesRevision.value).toBeGreaterThan(0)
  })

  it('代码编辑草稿不逐键进入 undo 历史，flush 后才提交一次', () => {
    const scope = effectScope()
    scope.run(() => {
      const state = useDevState()
      state.activePageId.value = 'demo'
      const doc = state.documents['script.js']
      doc.loadFromText('const a = 1\n', { markSaved: true })

      const activeFile = ref<PageConfigFileName>('script.js')
      const editor = useDevFileEditor(state, activeFile)
      editor.updateText('const a = 12\n')
      editor.updateText('const a = 123\n')

      expect(editor.text.value).toBe('const a = 123\n')
      expect(doc.text.value).toBe('const a = 1\n')
      expect(doc.canUndo.value).toBe(false)
      expect(state.isDocumentDirty('script.js')).toBe(true)

      editor.flushPendingText()

      expect(doc.text.value).toBe('const a = 123\n')
      expect(doc.canUndo.value).toBe(true)
      expect(state.hasPageFileDraft('script.js')).toBe(false)
    })
    scope.stop()
  })

  it('pagedata 文本草稿解析失败时保留草稿并阻止保存', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const state = useDevState()
      state.activePageId.value = 'demo'
      const doc = state.documents['pagedata.json']
      doc.loadFromText('{"dataSetName":"TestDS","tables":{}}', { markSaved: true })

      const activeFile = ref<PageConfigFileName>('pagedata.json')
      const editor = useDevFileEditor(state, activeFile)
      editor.updateDraftText('{"dataSetName":')

      await state.savePageFile('pagedata.json')

      expect(httpMock.put).not.toHaveBeenCalled()
      expect(state.hasPageFileDraft('pagedata.json')).toBe(true)
      expect(editor.text.value).toBe('{"dataSetName":')
      expect(doc.parseError.value).toBeTruthy()
    })
    scope.stop()
  })

  it('undo invalid pagedata draft restores the last valid document without adding history', () => {
    const scope = effectScope()
    scope.run(() => {
      const state = useDevState()
      state.activePageId.value = 'demo'
      const doc = state.documents['pagedata.json']
      doc.loadFromText('{"dataSetName":"TestDS","tables":{}}', { markSaved: true })

      const activeFile = ref<PageConfigFileName>('pagedata.json')
      const editor = useDevFileEditor(state, activeFile)
      editor.updateDraftText('{"dataSetName":')
      editor.undo()

      expect(state.hasPageFileDraft('pagedata.json')).toBe(false)
      expect(doc.parseError.value).toBeNull()
      expect(doc.canUndo.value).toBe(false)
      expect(editor.text.value).toContain('"TestDS"')
    })
    scope.stop()
  })
})
