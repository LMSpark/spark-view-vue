import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
}))

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

vi.mock('@/services/http', () => ({
  http: {
    get: httpGet,
    post: httpPost,
    put: httpPut,
  },
}))

vi.mock('@/services/api-paths', () => ({
  getPageApi: () => '/api/pages-config',
  getNavApi: () => '/api/navigation',
}))

import { canonicalizePageDataJson } from '../src/views/app/dev-system/policies/pageDataJsonSchema'
import { PAGE_FILE_NAMES, useDevState } from '../src/views/app/dev-system/useDevState'

function createPageDataText(name: string, compact = false): string {
  const payload = {
    dataSetName: 'OrdersDS',
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
        views: {
          default: {
            rows: [{ id: 1, name }],
          },
        },
      },
    },
  }

  return compact
    ? JSON.stringify(payload)
    : `${JSON.stringify(payload, null, 2)}\n`
}

describe('useDevState pagedata local history', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-05T00:00:00Z'))
    localStorage.clear()
    httpGet.mockReset()
    httpPost.mockReset()
    httpPut.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('captures loaded pagedata into local history so the first edit can undo without saving', async () => {
    const initialPageDataText = createPageDataText('Alpha', true)

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) {
        return { content: initialPageDataText, currentVersion: 3 }
      }

      const requestedFile = PAGE_FILE_NAMES.find((fileName) => url.endsWith(`/${fileName}`))
      if (requestedFile) {
        return { content: '' }
      }

      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.loadPageFile('pagedata.json')

    expect(state.getFileHistoryCount('pagedata.json')).toBe(1)
    expect(state.canFileHistoryBack('pagedata.json')).toBe(false)
    expect(state.fileDirty['pagedata.json']).toBe(false)

    const editedPageDataText = createPageDataText('Beta', true)
    state.updatePageFile('pagedata.json', editedPageDataText)

    // Still 1 snapshot (interval not elapsed), but current text diverged → can undo
    expect(state.getFileHistoryCount('pagedata.json')).toBe(1)
    expect(state.canFileHistoryBack('pagedata.json')).toBe(true)
    expect(state.goFileHistoryBack('pagedata.json')).toBe(true)
    expect(state.editFiles['pagedata.json']).toBe(canonicalizePageDataJson(initialPageDataText).text)
    expect(state.goFileHistoryForward('pagedata.json')).toBe(true)
    expect(state.editFiles['pagedata.json']).toBe(canonicalizePageDataJson(editedPageDataText).text)
  })

  it('does not overwrite dirty pagedata during passive reload attempts', async () => {
    const remoteInitial = createPageDataText('Remote-Initial', true)
    const remoteLatest = createPageDataText('Remote-Latest', true)
    let pagedataFetchCount = 0

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) {
        pagedataFetchCount += 1
        return { content: pagedataFetchCount === 1 ? remoteInitial : remoteLatest }
      }

      const requestedFile = PAGE_FILE_NAMES.find((fileName) => url.endsWith(`/${fileName}`))
      if (requestedFile) {
        return { content: '' }
      }

      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.loadPageFile('pagedata.json')

    const localDraft = createPageDataText('Local-Draft', true)
    state.updatePageFile('pagedata.json', localDraft)
    expect(state.fileDirty['pagedata.json']).toBe(true)

    // Simulate an external reload hint while local draft is still dirty.
    state.fileLoadState['pagedata.json'] = 'idle'
    await state.loadPageFile('pagedata.json')

    expect(pagedataFetchCount).toBe(1)
    expect(state.editFiles['pagedata.json']).toBe(canonicalizePageDataJson(localDraft).text)
  })

  it('loads all page files once and reuses them across later file access', async () => {
    const fetchCountByFile = Object.fromEntries(PAGE_FILE_NAMES.map((name) => [name, 0])) as Record<string, number>

    httpGet.mockImplementation(async (url: string) => {
      const requestedFile = PAGE_FILE_NAMES.find((fileName) => url.endsWith(`/${fileName}`))
      if (!requestedFile) {
        throw new Error(`unexpected GET ${url}`)
      }

      fetchCountByFile[requestedFile] = (fetchCountByFile[requestedFile] ?? 0) + 1

      if (requestedFile === 'pagedata.json') {
        return { content: createPageDataText('Shared-Load', true) }
      }

      if (requestedFile === 'rule.json') {
        return { content: '[]\n' }
      }

      return { content: '' }
    })

    const state = useDevState()
    state.selectPage('orders-page')

    await state.ensureActivePageFilesLoaded()
    await state.loadPageFile('pagedata.json')
    await state.loadPageFile('rule.json')

    expect(fetchCountByFile).toEqual({
      'rule.json': 1,
      'pagedata.json': 1,
      'script.js': 1,
      'style.css': 1,
    })
    expect(state.fileLoadState['rule.json']).toBe('loaded')
    expect(state.fileLoadState['pagedata.json']).toBe('loaded')
    expect(state.editFiles['pagedata.json']).toContain('Shared-Load')
  })

  it('keeps the live rule model in sync when undoing local rule history', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    state.updatePageFile('rule.json', `${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    state.updatePageFile('rule.json', `${JSON.stringify([{ type: 'el-button' }], null, 2)}\n`)

    expect(state.pageRuleDocument.value?.[0]?.type).toBe('el-button')
    expect(state.goFileHistoryBack('rule.json')).toBe(true)
    expect(state.editFiles['rule.json']).toBe(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    expect(state.pageRuleDocument.value?.[0]?.type).toBe('div')
  })

  it('keeps the live script document in sync when undoing local script history', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    state.updatePageFile('rule.json', `${JSON.stringify([{ type: 'div' }], null, 2)}\n`)

    state.updatePageFile('script.js', 'console.log("alpha")\n')
    state.updatePageFile('script.js', 'console.log("beta")\n')

    expect(state.pageScriptDocument.value).toBe('console.log("beta")\n')
    expect(state.goFileHistoryBack('script.js')).toBe(true)
    expect(state.editFiles['script.js']).toBe('console.log("alpha")\n')
    expect(state.pageScriptDocument.value).toBe('console.log("alpha")\n')
  })

  it('keeps the live style document in sync when undoing local style history', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    state.updatePageFile('rule.json', `${JSON.stringify([{ type: 'div' }], null, 2)}\n`)

    state.updatePageFile('style.css', '.page { color: red; }\n')
    state.updatePageFile('style.css', '.page { color: blue; }\n')

    expect(state.pageStyleDocument.value).toBe('.page { color: blue; }\n')
    expect(state.goFileHistoryBack('style.css')).toBe(true)
    expect(state.editFiles['style.css']).toBe('.page { color: red; }\n')
    expect(state.pageStyleDocument.value).toBe('.page { color: red; }\n')
  })

  it('does not append local history on save because save only uploads to backend', async () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    const editedPageDataText = createPageDataText('Gamma', true)
    state.updatePageFile('pagedata.json', editedPageDataText)

    const historyCountBeforeSave = state.getFileHistoryCount('pagedata.json')
    httpPut.mockResolvedValue({ ok: true })

    await state.savePageFile('pagedata.json')

    expect(httpPut).toHaveBeenCalledWith(
      '/api/pages-config/orders-page/pagedata.json',
      canonicalizePageDataJson(editedPageDataText).text,
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(state.getFileHistoryCount('pagedata.json')).toBe(historyCountBeforeSave)
    expect(state.fileDirty['pagedata.json']).toBe(false)
  })

  it('uses the shared live pagedata document as the source before exporting text', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    state.updatePageFile('rule.json', '[]\n')

    const initialPageDataText = createPageDataText('Live-Alpha', true)
    state.updatePageFile('pagedata.json', initialPageDataText)
    const persistedText = state.editFiles['pagedata.json']

    expect(state.mutateLivePageData((tool) => {
      tool.createColumn({
        tableName: 'Orders',
        column: { name: 'status', type: 'string' },
      })
    })).toBe(true)

    expect(state.pageDataTool.value?.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()
    expect(state.pageDataDocument.value?.tables['Orders']?.columns.some(column => column.name === 'status')).toBe(true)
    expect(state.pageDataDocument.value?.tables['Orders']?.columns.some(column => column.name === 'status')).toBe(true)
    expect(state.editFiles['pagedata.json']).toBe(persistedText)

    expect(state.undoLivePageData()).toBe(true)
    expect(state.pageDataDocument.value?.tables['Orders']?.columns.some(column => column.name === 'status')).toBe(false)
    expect(state.redoLivePageData()).toBe(true)
    expect(state.pageDataDocument.value?.tables['Orders']?.columns.some(column => column.name === 'status')).toBe(true)
  })

  it('saves the current live pagedata model when the designer changed only the in-memory model', async () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    state.updatePageFile('rule.json', '[]\n')
    state.updatePageFile('pagedata.json', createPageDataText('Save-Live-Alpha', true))

    expect(state.mutateLivePageData((tool) => {
      tool.createColumn({
        tableName: 'Orders',
        column: { name: 'status', type: 'string' },
      })
    })).toBe(true)

    expect(state.pageDataDesignerDirty.value).toBe(true)
    httpPut.mockResolvedValue({ ok: true })

    await state.savePageFile('pagedata.json')

    expect(httpPut).toHaveBeenCalledTimes(1)
    expect(httpPut.mock.calls[0]?.[0]).toBe('/api/pages-config/orders-page/pagedata.json')
    expect(String(httpPut.mock.calls[0]?.[1] ?? '')).toContain('status')
    expect(state.editFiles['pagedata.json']).toContain('status')
    expect(state.fileDirty['pagedata.json']).toBe(false)
    expect(state.pageDataDesignerDirty.value).toBe(false)
  })

  it('reinitializes pagedata runtime state when switching to another page', () => {
    const state = useDevState()

    state.selectPage('orders-page')
    state.updatePageFile('pagedata.json', createPageDataText('Cross-Page-Alpha', true))

    expect(state.mutateLivePageData((tool) => {
      tool.createColumn({
        tableName: 'Orders',
        column: { name: 'status', type: 'string' },
      })
    })).toBe(true)

    expect(state.pageDataTool.value?.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()
    expect(state.pageDataDesignerDirty.value).toBe(true)
    expect(state.getFileHistoryCount('pagedata.json')).toBe(1)

    state.selectPage('orders-page-v2')

    expect(state.activePageId.value).toBe('orders-page-v2')
    expect(state.editFiles['pagedata.json']).toBe('')
    expect(state.fileLoadState['pagedata.json']).toBe('idle')
    expect(state.fileDirty['pagedata.json']).toBe(false)
    expect(state.pageDataTool.value).toBeNull()
    expect(state.pageDataDocument.value).toBeNull()
    expect(state.pageDataDesignerDirty.value).toBe(false)
    expect(state.getFileHistoryCount('pagedata.json')).toBe(0)
  })

  it('does not record manual page-model patches into the AI transaction stack', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    state.updatePageFile('rule.json', '[]\n')
    state.updatePageFile('pagedata.json', createPageDataText('Manual-Alpha', true))

    const basePageData = cloneJson(state.pageDataDocument.value!)
    const manualOrders = basePageData.tables['Orders']!
    const manualPageData = {
      ...basePageData,
      tables: {
        ...basePageData.tables,
        Orders: {
          ...manualOrders,
          columns: [
            ...manualOrders.columns,
            { name: 'status', type: 'string' },
          ],
        },
      },
    }

    state.applyPageFiles(
      { 'pagedata.json': canonicalizePageDataJson(JSON.stringify(manualPageData)).text },
      { source: 'manual' },
    )

    expect(state.editFiles['pagedata.json']).toContain('status')
    expect(state.getPageEditTransactionCount()).toBe(0)
    expect(state.canPageEditTransactionBack()).toBe(false)

    const aiOrders = manualPageData.tables['Orders']!
    const aiPageData = {
      ...manualPageData,
      tables: {
        ...manualPageData.tables,
        Orders: {
          ...aiOrders,
          columns: [
            ...aiOrders.columns,
            { name: 'memo', type: 'string' },
          ],
        },
      },
    }

    state.applyPageFiles(
      { 'pagedata.json': canonicalizePageDataJson(JSON.stringify(aiPageData)).text },
      { source: 'ai' },
    )

    expect(state.getPageEditTransactionCount()).toBe(1)
    expect(state.canPageEditTransactionBack()).toBe(true)
  })

  it('tracks non-pagedata files with local undo redo history and restores clean state at the loaded baseline', async () => {
    const initialRuleText = '{\n  "name": "alpha"\n}\n'
    const updatedRuleText = '{\n  "name": "beta"\n}\n'
    const latestRuleText = '{\n  "name": "gamma"\n}\n'

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) {
        return { content: initialRuleText }
      }

      const requestedFile = PAGE_FILE_NAMES.find((fileName) => url.endsWith(`/${fileName}`))
      if (requestedFile) {
        return { content: '' }
      }

      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.loadPageFile('rule.json')

    expect(state.getFileHistoryCount('rule.json')).toBe(1)
    expect(state.canFileHistoryBack('rule.json')).toBe(false)

    state.updatePageFile('rule.json', updatedRuleText)
    state.updatePageFile('rule.json', latestRuleText)

    expect(state.getFileHistoryCount('rule.json')).toBe(1)
    expect(state.canFileHistoryBack('rule.json')).toBe(true)
    expect(state.goFileHistoryBack('rule.json')).toBe(true)
    expect(state.editFiles['rule.json']).toBe(initialRuleText)
    expect(state.fileDirty['rule.json']).toBe(false)

    expect(state.goFileHistoryForward('rule.json')).toBe(true)
    expect(state.editFiles['rule.json']).toBe(latestRuleText)
    expect(state.fileDirty['rule.json']).toBe(true)
  })

  it('commits a new pagedata snapshot only after the minimum interval elapses', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    state.updatePageFile('pagedata.json', createPageDataText('Snapshot-1', true))
    expect(state.getFileHistoryCount('pagedata.json')).toBe(1)

    state.updatePageFile('pagedata.json', createPageDataText('Snapshot-2', true))
    expect(state.getFileHistoryCount('pagedata.json')).toBe(1)

    vi.advanceTimersByTime(5001)
    state.updatePageFile('pagedata.json', createPageDataText('Snapshot-3', true))

    expect(state.getFileHistoryCount('pagedata.json')).toBe(2)
  })

  it('commits a new text snapshot only after the minimum interval elapses', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    state.updatePageFile('script.js', 'console.log("snapshot-1")\n')
    expect(state.getFileHistoryCount('script.js')).toBe(1)

    state.updatePageFile('script.js', 'console.log("snapshot-2")\n')
    expect(state.getFileHistoryCount('script.js')).toBe(1)

    vi.advanceTimersByTime(5001)
    state.updatePageFile('script.js', 'console.log("snapshot-3")\n')

    expect(state.getFileHistoryCount('script.js')).toBe(2)
    expect(state.goFileHistoryBack('script.js')).toBe(true)
    expect(state.editFiles['script.js']).toBe('console.log("snapshot-1")\n')
  })

  it('does not append non-pagedata local history on save because save only persists the current snapshot', async () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    state.updatePageFile('script.js', 'console.log("alpha")\n')
    const historyCountBeforeSave = state.getFileHistoryCount('script.js')

    httpPut.mockResolvedValue({ ok: true })

    await state.savePageFile('script.js')

    expect(httpPut).toHaveBeenCalledWith(
      '/api/pages-config/orders-page/script.js',
      'console.log("alpha")\n',
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(state.getFileHistoryCount('script.js')).toBe(historyCountBeforeSave)
    expect(state.fileDirty['script.js']).toBe(false)
  })

  it('reuses pagedata snapshots cyclically after reaching the local snapshot limit', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    for (let index = 1; index <= 101; index += 1) {
      if (index > 1) {
        vi.advanceTimersByTime(5001)
      }
      state.updatePageFile('pagedata.json', createPageDataText(`Snapshot-${index}`, true))
    }

    expect(state.getFileHistoryCount('pagedata.json')).toBe(100)

    for (let step = 0; step < 99; step += 1) {
      expect(state.goFileHistoryBack('pagedata.json')).toBe(true)
    }

    expect(state.editFiles['pagedata.json']).toBe(canonicalizePageDataJson(createPageDataText('Snapshot-2', true)).text)
    expect(state.goFileHistoryBack('pagedata.json')).toBe(false)
  })

  it('reuses text snapshots cyclically after reaching the local snapshot limit', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    for (let index = 1; index <= 101; index += 1) {
      if (index > 1) {
        vi.advanceTimersByTime(5001)
      }
      state.updatePageFile('script.js', `console.log("snapshot-${index}")\n`)
    }

    expect(state.getFileHistoryCount('script.js')).toBe(100)

    for (let step = 0; step < 99; step += 1) {
      expect(state.goFileHistoryBack('script.js')).toBe(true)
    }

    expect(state.editFiles['script.js']).toBe('console.log("snapshot-2")\n')
    expect(state.goFileHistoryBack('script.js')).toBe(false)
  })
})