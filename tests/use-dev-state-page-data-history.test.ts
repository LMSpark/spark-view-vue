import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
}))

vi.mock('@/services/http', () => ({
  http: { get: httpGet, post: httpPost, put: httpPut },
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
  return compact ? JSON.stringify(payload) : `${JSON.stringify(payload, null, 2)}\n`
}

describe('useDevState documents SSOT', () => {
  beforeEach(() => {
    localStorage.clear()
    httpGet.mockReset()
    httpPost.mockReset()
    httpPut.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loading pagedata from remote parses into a clean model', async () => {
    const initial = createPageDataText('Alpha', true)
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    const doc = state.documents['pagedata.json']
    expect(doc.loadState.value).toBe('loaded')
    expect(doc.isDirty.value).toBe(false)
    expect(doc.model.value).not.toBeNull()
    expect(doc.canUndo.value).toBe(false)
    expect(doc.text.value).toBe(canonicalizePageDataJson(initial).text)
  })

  it('editing pagedata text reparses model, makes doc dirty and enables undo', async () => {
    const initial = createPageDataText('Alpha', true)
    const next = createPageDataText('Beta', true)

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    const doc = state.documents['pagedata.json']
    doc.setText(next)

    expect(doc.isDirty.value).toBe(true)
    expect(doc.canUndo.value).toBe(true)
    expect(doc.text.value).toBe(canonicalizePageDataJson(next).text)

    expect(doc.undo()).toBe(true)
    expect(doc.text.value).toBe(canonicalizePageDataJson(initial).text)
    expect(doc.isDirty.value).toBe(false)

    expect(doc.redo()).toBe(true)
    expect(doc.text.value).toBe(canonicalizePageDataJson(next).text)
  })

  it('ensureActivePageFilesLoaded loads each file exactly once', async () => {
    const fetchCount: Record<string, number> = {}
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
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
    for (const name of PAGE_FILE_NAMES) {
      expect(state.documents[name].loadState.value).toBe('loaded')
    }
  })

  it('ensureActivePageFilesLoaded fails fast and preserves existing documents when remote fetch fails', async () => {
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
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
      const name = PAGE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
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
    expect(JSON.parse(doc.text.value)[0]).toMatchObject({ type: 'div' })
  })

  it('script.js undo stays in sync with the live model', () => {
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

  it('style.css undo stays in sync with the live model', () => {
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

    expect(doc.isDirty.value).toBe(true)
    const canUndoBefore = doc.canUndo.value

    httpPut.mockResolvedValue({ ok: true })
    httpGet.mockResolvedValue([])

    await state.savePageFile('pagedata.json')

    expect(httpPut).toHaveBeenCalledWith(
      '/api/pages-config/orders-page/pagedata.json',
      doc.text.value,
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(doc.isDirty.value).toBe(false)
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
    for (const name of PAGE_FILE_NAMES) {
      const doc = state.documents[name]
      expect(doc.model.value).toBeNull()
      expect(doc.isDirty.value).toBe(false)
      expect(doc.loadState.value).toBe('idle')
      expect(doc.savedText.value).toBe('')
    }
  })

  it('rule load followed by undo to baseline keeps the document clean', async () => {
    const initial = '[]\n'
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) return { content: initial }
      const name = PAGE_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    const doc = state.documents['rule.json']
    expect(doc.isDirty.value).toBe(false)
    expect(doc.canUndo.value).toBe(false)

    doc.setText(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    expect(doc.isDirty.value).toBe(true)
    expect(doc.canUndo.value).toBe(true)

    expect(doc.undo()).toBe(true)
    expect(doc.isDirty.value).toBe(false)
    expect(doc.canUndo.value).toBe(false)
    expect(doc.text.value).toBe(initial)
  })

  it('pageDataDesignerDirty mirrors pagedata document dirty flag', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    expect(state.pageDataDesignerDirty.value).toBe(false)
    state.documents['pagedata.json'].setText(createPageDataText('Dirty', true))
    expect(state.pageDataDesignerDirty.value).toBe(true)
  })

  it('live model adapter provides a stable blank DataSet tool for empty pagedata', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    const adapter = state.getLiveModelAdapter()
    const first = adapter.getDataSetTool?.()
    const second = adapter.getDataSetTool?.()

    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(first?.toJson()).toEqual({
      dataSetName: 'orders-page',
      schemaVersion: 2,
      tables: {},
    })
    expect(state.documents['pagedata.json'].model.value).toBeNull()
  })
})
