import { describe, expect, it, vi } from 'vitest'
import { ConfigPageNode } from '@spark-appworks/spark-project-model'
import { PageContentRepository } from '../src/io/page-content-repository'
import type { PageNodeFileName, PageNodeFileVersionSummary } from '../src/model/page/file'
import type { ProjectModelIoPorts } from '../src/model/project/ports'
import { PAGE_NODE_FILE_NAMES } from '../src/model/page/file'

function createTestPage(pageId = 'orders'): ConfigPageNode {
  return new ConfigPageNode({
    node: { id: pageId, title: '订单', nodeKind: 'page', path: `/${pageId}` },
    pid: '',
    pageId,
  })
}

function createMockIo(fileTexts: Partial<Record<PageNodeFileName, string>> = {}): {
  io: ProjectModelIoPorts
  loadPageFileContent: ReturnType<typeof vi.fn>
  saved: Array<{ pageId: string; filename: PageNodeFileName; content: string }>
  cacheCleared: Array<{ pageId: string; filename?: PageNodeFileName }>
} {
  const defaults: Record<PageNodeFileName, string> = {
    'rule.json': `${JSON.stringify([{ type: 'div' }], null, 2)}\n`,
    'pagedata.json': '{"dataSetName":"orders","tables":{}}\n',
    'script.js': '',
    'style.css': '',
  }
  const texts = { ...defaults, ...fileTexts }
  const saved: Array<{ pageId: string; filename: PageNodeFileName; content: string }> = []
  const cacheCleared: Array<{ pageId: string; filename?: PageNodeFileName }> = []

  const loadPageFileContent = vi.fn(async (_pageId: string, filename: PageNodeFileName) => ({
    success: true,
    data: texts[filename],
  }))
  const loader = {
    loadPageFileContent,
    getHttpClient: () => undefined,
  }

  const io: ProjectModelIoPorts = {
    fileApi: {
      createFiles: vi.fn(async () => ({ ok: true })),
      deleteFiles: vi.fn(async () => {}),
      saveFileContent: vi.fn(async (pageId, filename, content) => {
        saved.push({ pageId, filename, content })
      }),
      listVersions: vi.fn(async (): Promise<PageNodeFileVersionSummary[]> => [
        { version: 1, createdAt: '2026-01-01', isCurrent: true, modifiedBy: null },
      ]),
      restoreVersion: vi.fn(async () => {}),
      createVersion: vi.fn(async () => {}),
      deleteVersion: vi.fn(async () => {}),
    },
    fileCache: {
      clearPageCache: vi.fn((pageId, filename) => {
        cacheCleared.push({ pageId, filename })
      }),
    },
    contentLoaderFactory: () => loader,
  }

  return { io, loadPageFileContent, saved, cacheCleared }
}

describe('PageContentRepository', () => {
  it('loadPage hydrates all four files and marks page loaded', async () => {
    const page = createTestPage()
    const { io } = createMockIo()
    const repo = new PageContentRepository(io)

    await repo.loadPage(page)

    expect(page.isLoaded).toBe(true)
    expect(page.getFileText('rule.json')).toContain('"type": "div"')
    expect(page.getFileText('pagedata.json')).toContain('orders')
    expect(page.isDirty()).toBe(false)
  })

  it('loadPage skips when already loaded unless forceReload', async () => {
    const page = createTestPage()
    const { io, loadPageFileContent } = createMockIo({ 'rule.json': '[]\n' })
    const repo = new PageContentRepository(io)
    await repo.loadPage(page)
    loadPageFileContent.mockClear()

    await repo.loadPage(page)
    expect(loadPageFileContent).not.toHaveBeenCalled()

    await repo.loadPage(page, { forceReload: true })
    expect(loadPageFileContent).toHaveBeenCalledTimes(PAGE_NODE_FILE_NAMES.length)
  })

  it('savePageFile persists text, clears dirty, and invalidates cache', async () => {
    const page = createTestPage()
    const { io, saved, cacheCleared } = createMockIo()
    const repo = new PageContentRepository(io)

    await repo.loadPage(page)
    page.setFileText('rule.json', '[{"type":"span"}]\n')

    await repo.savePageFile(page, 'rule.json')

    expect(saved).toHaveLength(1)
    expect(saved[0]?.pageId).toBe('orders')
    expect(saved[0]?.filename).toBe('rule.json')
    expect(saved[0]?.content).toContain('span')
    expect(page.isDirty()).toBe(false)
    expect(cacheCleared).toContainEqual({ pageId: 'orders', filename: 'rule.json' })
  })

  it('saveDirtyPageFiles only saves dirty files', async () => {
    const page = createTestPage()
    const { io, saved } = createMockIo()
    const repo = new PageContentRepository(io)

    await repo.loadPage(page)
    page.setFileText('script.js', 'export {}\n')

    await repo.saveDirtyPageFiles(page)

    expect(saved).toHaveLength(1)
    expect(saved[0]?.filename).toBe('script.js')
  })

  it('createPageFiles and deletePageFiles clear page cache', async () => {
    const page = createTestPage()
    const { io, cacheCleared } = createMockIo()
    const repo = new PageContentRepository(io)

    await repo.createPageFiles(page, { title: '订单' })
    await repo.deletePageFiles(page)

    expect(io.fileApi.createFiles).toHaveBeenCalledWith({
      pageId: 'orders',
      title: '订单',
    })
    expect(io.fileApi.deleteFiles).toHaveBeenCalledWith('orders')
    expect(cacheCleared).toEqual([
      { pageId: 'orders', filename: undefined },
      { pageId: 'orders', filename: undefined },
    ])
  })

  it('restoreRemoteFileVersion reloads file and marks saved', async () => {
    const page = createTestPage()
    const { io, cacheCleared } = createMockIo({
      'rule.json': '[{"type":"restored"}]\n',
    })
    const repo = new PageContentRepository(io)

    await repo.loadPage(page)
    page.setFileText('rule.json', '[{"type":"draft"}]\n')
    expect(page.isDirty()).toBe(true)

    await repo.restoreRemoteFileVersion(page, 'rule.json', 1)

    expect(io.fileApi.restoreVersion).toHaveBeenCalledWith('orders', 'rule.json', 1)
    expect(page.getFileText('rule.json')).toContain('restored')
    expect(page.isDirty()).toBe(false)
    expect(cacheCleared.at(-1)).toEqual({ pageId: 'orders', filename: 'rule.json' })
  })

  it('throws when loader returns failure', async () => {
    const page = createTestPage()
    const { io, loadPageFileContent } = createMockIo()
    loadPageFileContent.mockResolvedValueOnce({
      success: false,
      error: 'network down',
    })
    const repo = new PageContentRepository(io)

    await expect(repo.loadPage(page)).rejects.toThrow('network down')
    expect(page.isLoaded).toBe(false)
  })
})
