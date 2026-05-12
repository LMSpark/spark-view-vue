import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { httpGet, httpPut, pageConfigWorkspaceDataService } = vi.hoisted(() => {
  const httpGet = vi.fn()
  const httpPut = vi.fn()
  const pageApi = '/api/tenants/t1/projects/p1/pages-config'
  const navApi = '/api/tenants/t1/projects/p1/navigation'
  const fileNames = ['rule.json', 'pagedata.json', 'script.js', 'style.css'] as const
  const isStatus = (error: unknown, status: number): boolean => {
    if (error === null || typeof error !== 'object') return false
    const candidate = error as { status?: unknown; response?: { status?: unknown } }
    return candidate.status === status || candidate.response?.status === status
  }
  const readFileText = async (
    pageId: string,
    filename: typeof fileNames[number],
    options?: { missing?: 'throw' | 'empty' },
  ): Promise<string> => {
    try {
      const data = await httpGet(`${pageApi}/${pageId}/${filename}`) as Record<string, unknown>
      return String(data['content'] ?? '')
    } catch (error) {
      if (options?.missing === 'empty' && isStatus(error, 404)) return ''
      const reason = isStatus(error, 404) ? 'not-found' : 'unknown'
      throw new Error(`读取页面文件失败: ${pageId}/${filename} (${reason})`)
    }
  }
  return {
    httpGet,
    httpPut,
    pageConfigWorkspaceDataService: {
      pageConfig: {
        listPages: () => httpGet(`${pageApi}/__list`),
        readFileText,
        readFiles: async (pageId: string, options?: { missing?: 'throw' | 'empty' }) => Object.fromEntries(
          await Promise.all(fileNames.map(async filename => [
            filename,
            await readFileText(pageId, filename, options),
          ])),
        ),
        saveFileContent: (pageId: string, filename: typeof fileNames[number], content: string) =>
          httpPut(`${pageApi}/${pageId}/${filename}`, content, { headers: { 'Content-Type': 'text/plain' } }),
        clearCache: vi.fn(),
      },
      navigation: {
        loadConfig: () => httpGet(navApi),
        saveConfig: (root: unknown) => httpPut(navApi, root),
      },
    },
  }
})

vi.mock('@/services/page-config-workspace-data-service', () => ({
  pageConfigWorkspaceDataService,
}))

import { canonicalizePageDataJson } from '@spark-view/spark-page-config'
import { PAGE_CONFIG_FILE_NAMES } from '@spark-view/spark-page-config'
import { useDevState } from '../src/views/app/dev-system/useDevState'

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
  return compact ? JSON.stringify(payload) : `${JSON.stringify(payload, null, 2)}\n`
}

describe('useDevState documents SSOT', () => {
  beforeEach(() => {
    localStorage.clear()
    httpGet.mockReset()
    httpPut.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loading pagedata from remote parses into a clean model', async () => {
    const initial = createPageDataText('Alpha', true)
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    const doc = state.documents['pagedata.json']
    expect(doc.loadState.value).toBe('loaded')
    expect(isDocumentDirty(doc)).toBe(false)
    expect(doc.model.value).not.toBeNull()
    expect(doc.canUndo.value).toBe(false)
    expect(doc.text.value).toBe(canonicalizePageDataJson(initial).text)
  })

  it('editing pagedata text reparses model, makes doc dirty and enables undo', async () => {
    const initial = createPageDataText('Alpha', true)
    const next = createPageDataText('Beta', true)

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    const doc = state.documents['pagedata.json']
    doc.setText(next)

    expect(isDocumentDirty(doc)).toBe(true)
    expect(doc.canUndo.value).toBe(true)
    expect(doc.text.value).toBe(canonicalizePageDataJson(next).text)

    expect(doc.undo()).toBe(true)
    expect(doc.text.value).toBe(canonicalizePageDataJson(initial).text)
    expect(isDocumentDirty(doc)).toBe(false)

    expect(doc.redo()).toBe(true)
    expect(doc.text.value).toBe(canonicalizePageDataJson(next).text)
  })

  it('ensureActivePageFilesLoaded loads each file exactly once', async () => {
    const fetchCount: Record<string, number> = {}
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (!name) throw new Error(`unexpected GET ${url}`)
      fetchCount[name] = (fetchCount[name] ?? 0) + 1
      if (name === 'pagedata.json') return { content: createPageDataText('Shared', true) }
      if (name === 'rule.json') return { content: '[]\n' }
      return { content: '' }
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()
    await state.ensureActivePageFilesLoaded()

    expect(fetchCount).toEqual({
      'rule.json': 1,
      'pagedata.json': 1,
      'script.js': 1,
      'style.css': 1,
    })
    for (const name of PAGE_CONFIG_FILE_NAMES) {
      expect(state.documents[name].loadState.value).toBe('loaded')
    }
  })

  it('ensureActivePageFilesLoaded fails fast and preserves existing documents when remote fetch fails', async () => {
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (!name) throw new Error(`unexpected GET ${url}`)
      if (name === 'pagedata.json') return { content: createPageDataText('Stable', true) }
      if (name === 'rule.json') return { content: '[]\n' }
      return { content: '' }
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    const ruleDoc = state.documents['rule.json']
    const pagedataDoc = state.documents['pagedata.json']
    const previousRuleText = ruleDoc.text.value
    const previousPageDataText = pagedataDoc.text.value

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw new Error('network-down')
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (!name) throw new Error(`unexpected GET ${url}`)
      if (name === 'pagedata.json') return { content: createPageDataText('Mutated', true) }
      return { content: '' }
    })

    await expect(state.ensureActivePageFilesLoaded({ forceReload: true })).rejects.toThrow(
      '读取页面文件失败: orders-page/rule.json',
    )

    expect(ruleDoc.text.value).toBe(previousRuleText)
    expect(pagedataDoc.text.value).toBe(previousPageDataText)
    expect(ruleDoc.loadState.value).toBe('loaded')
    expect(pagedataDoc.loadState.value).toBe('loaded')
  })

  it('rule.json setText + undo reflects in the live SparkNodeTree', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    const doc = state.documents['rule.json']

    doc.setText(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    doc.setText(`${JSON.stringify([{ type: 'el-button' }], null, 2)}\n`)

    const treeNow = doc.model.value!.toJSON()
    expect((treeNow.children?.[0] as { type?: string }).type).toBe('el-button')

    expect(doc.undo()).toBe(true)
    const treeUndo = doc.model.value!.toJSON()
    expect((treeUndo.children?.[0] as { type?: string }).type).toBe('div')
    expect(JSON.parse(doc.text.value)).toMatchObject({ type: 'div' })
  })

  it('script.js undo stays in sync with the page model', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    const doc = state.documents['script.js']

    doc.setText('console.log("alpha")\n')
    doc.setText('console.log("beta")\n')

    expect(doc.model.value).toBe('console.log("beta")\n')
    expect(doc.undo()).toBe(true)
    expect(doc.model.value).toBe('console.log("alpha")\n')
    expect(doc.text.value).toBe('console.log("alpha")\n')
  })

  it('style.css undo stays in sync with the page model', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    const doc = state.documents['style.css']

    doc.setText('.page { color: red; }\n')
    doc.setText('.page { color: blue; }\n')

    expect(doc.model.value).toBe('.page { color: blue; }\n')
    expect(doc.undo()).toBe(true)
    expect(doc.model.value).toBe('.page { color: red; }\n')
    expect(doc.text.value).toBe('.page { color: red; }\n')
  })

  it('savePageFile uploads current text and clears dirty without touching history', async () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    const doc = state.documents['pagedata.json']
    doc.setText(createPageDataText('Gamma', true))

    expect(isDocumentDirty(doc)).toBe(true)
    const canUndoBefore = doc.canUndo.value

    httpPut.mockResolvedValue({ ok: true })
    httpGet.mockResolvedValue([])

    await state.savePageFile('pagedata.json')

    expect(httpPut).toHaveBeenCalledWith(
      '/api/tenants/t1/projects/p1/pages-config/orders-page/pagedata.json',
      doc.text.value,
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(isDocumentDirty(doc)).toBe(false)
    expect(doc.canUndo.value).toBe(canUndoBefore)
  })

  it('designer-level mutate reflects in text and is undoable', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    const doc = state.documents['pagedata.json']
    doc.setText(createPageDataText('Live', true))

    const ok = doc.mutate((tool) => {
      tool.createColumn({ tableName: 'Orders', column: { name: 'status', type: 'string' } })
    })
    expect(ok).toBe(true)

    expect(doc.text.value).toContain('status')
    expect(doc.model.value!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()

    expect(doc.undo()).toBe(true)
    expect(doc.model.value!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeUndefined()

    expect(doc.redo()).toBe(true)
    expect(doc.model.value!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()
  })

  it('page switch resets all documents', () => {
    const state = useDevState()
    state.selectPage('orders-page')
    state.documents['pagedata.json'].setText(createPageDataText('PageA', true))
    state.documents['script.js'].setText('// a\n')

    expect(state.documents['pagedata.json'].model.value).not.toBeNull()
    expect(state.documents['script.js'].model.value).not.toBeNull()

    state.selectPage('orders-page-v2')

    expect(state.activePageId.value).toBe('orders-page-v2')
    for (const name of PAGE_CONFIG_FILE_NAMES) {
      const doc = state.documents[name]
      expect(doc.model.value).toBeNull()
      expect(isDocumentDirty(doc)).toBe(false)
      expect(doc.loadState.value).toBe('idle')
      expect(doc.savedText.value).toBe('')
    }
  })

  it('rule load followed by undo to baseline keeps the document clean', async () => {
    const initial = '[]\n'
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) return { content: initial }
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    const doc = state.documents['rule.json']
    expect(isDocumentDirty(doc)).toBe(false)
    expect(doc.canUndo.value).toBe(false)

    doc.setText(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    expect(isDocumentDirty(doc)).toBe(true)
    expect(doc.canUndo.value).toBe(true)

    expect(doc.undo()).toBe(true)
    expect(isDocumentDirty(doc)).toBe(false)
    expect(doc.canUndo.value).toBe(false)
    expect(doc.text.value).toBe(initial)
  })

  it('pageDataDirty mirrors pagedata document dirty flag', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    expect(state.pageDataDirty.value).toBe(false)
    state.documents['pagedata.json'].setText(createPageDataText('Dirty', true))
    expect(state.pageDataDirty.value).toBe(true)
  })

})

function isDocumentDirty(doc: { text: { value: string }; savedText: { value: string } }): boolean {
  return doc.text.value !== doc.savedText.value
}
