import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
}))

vi.mock('@/services/http', () => ({
  createAuthHeaders: () => ({}),
  http: { get: httpGet, post: httpPost, put: httpPut },
}))

vi.mock('@spark-view/spark-page-config/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@spark-view/spark-page-config/config')>()
  const readObjectProp = (value: unknown, key: string): unknown => {
    if (value === null || typeof value !== 'object') return undefined
    return Object.getOwnPropertyDescriptor(value, key)?.value
  }
  const requireRecord = (value: unknown, message: string): Record<string, unknown> => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value))
    }
    throw new Error(message)
  }
  const isStatus = (error: unknown, status: number): boolean => {
    const directStatus = readObjectProp(error, 'status')
    const responseStatus = readObjectProp(readObjectProp(error, 'response'), 'status')
    return directStatus === status || responseStatus === status
  }
  return {
    ...actual,
    createConfigLoader: vi.fn(() => ({
      loadPageFileContent: async (pageId: string, filename: string) => {
        try {
          const data = requireRecord(
            await httpGet(`/api/pages-config/${pageId}/${filename}`),
            `Invalid page file response: ${pageId}/${filename}`,
          )
          return { success: true, data: String(data['content'] ?? ''), source: 'remote', timestamp: Date.now() }
        } catch (error) {
          if ((filename === 'script.js' || filename === 'style.css') && isStatus(error, 404)) {
            return { success: true, data: '', source: 'remote', timestamp: Date.now() }
          }
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            reason: isStatus(error, 404) ? 'not-found' : 'unknown',
            timestamp: Date.now(),
          }
        }
      },
      clearCache: vi.fn(),
      getCacheStats: () => ({ size: 0, keys: [] }),
    })),
  }
})

vi.mock('@/services/api-paths', () => ({
  getPageApi: () => '/api/pages-config',
  getNavApi: () => '/api/navigation',
}))

import { canonicalizePageDataJson } from '@spark-view/spark-page-config/design'
import { PAGE_CONFIG_FILE_NAMES, useDevState, type PageFileName } from '../src/views/app/dev-system/useDevState'
import { useDevFileEditor } from '../src/views/app/dev-system/composables/useDevFileEditor'

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value !== null && value !== undefined) return value
  throw new Error(message)
}

function readFirstChildType(children: unknown): string {
  if (!Array.isArray(children)) throw new Error('Expected SparkNode children')
  const firstChild = children[0]
  if (firstChild === null || typeof firstChild !== 'object') {
    throw new Error('Expected first SparkNode child')
  }
  const type = Object.getOwnPropertyDescriptor(firstChild, 'type')?.value
  if (typeof type === 'string') return type
  throw new Error('Expected first SparkNode child type')
}

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

    const treeNow = requireValue(doc.model.value, 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeNow.children)).toBe('el-button')

    expect(doc.undo()).toBe(true)
    const treeUndo = requireValue(doc.model.value, 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeUndo.children)).toBe('div')
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
      '/api/pages-config/orders-page/pagedata.json',
      doc.text.value,
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(isDocumentDirty(doc)).toBe(false)
    expect(doc.canUndo.value).toBe(canUndoBefore)
  })

  it('dev file editor keeps JSON text in a draft until an explicit commit', () => {
    const state = useDevState()
    const initial = createPageDataText('Alpha', true)
    const next = createPageDataText('Draft', true)
    const doc = state.documents['pagedata.json']
    doc.loadFromText(initial)

    const scope = effectScope()
    try {
      scope.run(() => {
        const editor = useDevFileEditor(state, ref<PageFileName>('pagedata.json'))
        const initialCanonical = canonicalizePageDataJson(initial).text

        editor.updateText('{"dataSetName":')

        expect(editor.text.value).toBe('{"dataSetName":')
        expect(doc.text.value).toBe(initialCanonical)
        expect(doc.parseError.value).toBeNull()
        expect(editor.isDirty.value).toBe(true)

        expect(editor.commitText()).toBe(false)
        expect(editor.text.value).toBe('{"dataSetName":')
        expect(doc.text.value).toBe(initialCanonical)
        expect(doc.parseError.value).not.toBeNull()

        editor.updateText(next)
        expect(editor.commitText()).toBe(true)
        expect(editor.text.value).toBe(canonicalizePageDataJson(next).text)
        expect(doc.text.value).toBe(canonicalizePageDataJson(next).text)
      })
    } finally {
      scope.stop()
    }
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

