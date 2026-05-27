import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { BasePageConfigLoader } from '@spark-view/spark-page-config/editor'

const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
}))

vi.mock('@/services/http', () => ({
  createAuthHeaders: () => ({}),
  http: { get: httpGet, post: httpPost, put: httpPut },
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
  const createTestConfigLoader = (): BasePageConfigLoader => ({
      loadPageConfig: unsupported,
      loadRule: unsupported,
      loadPageData: unsupported,
      loadScript: unsupported,
      loadCss: unsupported,
      loadPageFile: unsupported,
      loadPageFileContent: async (pageId: string, filename: string) => {
        try {
          const data = requireRecord(
            await httpGet(`/api/pages-config/${pageId}/${filename}`),
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
    }) as BasePageConfigLoader
  return {
    ...actual,
    createPageEditor: vi.fn((options: Parameters<typeof actual.createPageEditor>[0]) => actual.createPageEditor({
      ...options,
      createConfigLoader: () => createTestConfigLoader(),
    })),
  }
})

vi.mock('@/services/api-paths', () => ({
  getPageApi: () => '/api/pages-config',
  getNavApi: () => '/api/navigation',
}))

import { canonicalizePageDataJson } from '@spark-view/spark-page-config/editor'
import { PAGE_CONFIG_FILE_NAMES, useDevState, type PageConfigFileName } from '../src/views/app/dev-system/useDevState'
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

    expect(state.getPageFileLoadState('pagedata.json')).toBe('loaded')
    expect(state.isDocumentDirty('pagedata.json')).toBe(false)
    expect(state.getDataSetTool()).not.toBeNull()
    expect(state.canUndoPageFile('pagedata.json')).toBe(false)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(initial).text)
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

    state.setPageFileText('pagedata.json', next)

    expect(state.isDocumentDirty('pagedata.json')).toBe(true)
    expect(state.canUndoPageFile('pagedata.json')).toBe(true)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(next).text)

    expect(state.undoPageFile('pagedata.json')).toBe(true)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(initial).text)
    // undo always marks dirty in V3.1 single-track model
    expect(state.isDocumentDirty('pagedata.json')).toBe(true)

    expect(state.redoPageFile('pagedata.json')).toBe(true)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(next).text)
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
      expect(state.getPageFileLoadState(name)).toBe('loaded')
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

    const previousRuleText = state.getPageFileText('rule.json')
    const previousPageDataText = state.getPageFileText('pagedata.json')

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) throw new Error('network-down')
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (!name) throw new Error(`unexpected GET ${url}`)
      if (name === 'pagedata.json') return { content: createPageDataText('Mutated', true) }
      return { content: '' }
    })

    // V3.1: errors propagate directly from config loader without wrapping
    await expect(state.ensureActivePageFilesLoaded({ forceReload: true })).rejects.toThrow(
      'network-down',
    )

    // V3.1: parallel load means pagedata may or may not be updated; only rule.json is guaranteed preserved
    expect(state.getPageFileText('rule.json')).toBe(previousRuleText)
    expect(state.getPageFileLoadState('rule.json')).toBe('loaded')
    expect(state.getPageFileLoadState('pagedata.json')).toBe('loaded')
  })

  it('rule.json setText + undo reflects in the live SparkNodeTree', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    state.setPageFileText('rule.json', `${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    state.setPageFileText('rule.json', `${JSON.stringify([{ type: 'el-button' }], null, 2)}\n`)

    const treeNow = requireValue(state.getNodeTree(), 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeNow.children)).toBe('el-button')

    expect(state.undoPageFile('rule.json')).toBe(true)
    const treeUndo = requireValue(state.getNodeTree(), 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeUndo.children)).toBe('div')
    expect(JSON.parse(state.getPageFileText('rule.json'))).toMatchObject({ type: 'div' })
  })

  it('script.js undo stays in sync with the page model', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    state.setPageFileText('script.js', 'console.log("alpha")\n')
    state.setPageFileText('script.js', 'console.log("beta")\n')

    expect(state.getPageFileText('script.js')).toBe('console.log("beta")\n')
    expect(state.undoPageFile('script.js')).toBe(true)
    expect(state.getPageFileText('script.js')).toBe('console.log("alpha")\n')
  })

  it('style.css undo stays in sync with the page model', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    state.setPageFileText('style.css', '.page { color: red; }\n')
    state.setPageFileText('style.css', '.page { color: blue; }\n')

    expect(state.getPageFileText('style.css')).toBe('.page { color: blue; }\n')
    expect(state.undoPageFile('style.css')).toBe(true)
    expect(state.getPageFileText('style.css')).toBe('.page { color: red; }\n')
  })

  it('savePageFile uploads current text and clears dirty without touching history', async () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    state.setPageFileText('pagedata.json', createPageDataText('Gamma', true))

    expect(state.isDocumentDirty('pagedata.json')).toBe(true)
    const canUndoBefore = state.canUndoPageFile('pagedata.json')

    httpPut.mockResolvedValue({ ok: true })
    httpGet.mockResolvedValue([])

    await state.savePageFile('pagedata.json')

    expect(httpPut).toHaveBeenCalledWith(
      '/api/pages-config/orders-page/pagedata.json',
      state.getPageFileText('pagedata.json'),
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(state.isDocumentDirty('pagedata.json')).toBe(false)
    expect(state.canUndoPageFile('pagedata.json')).toBe(canUndoBefore)
  })

  it('dev file editor keeps JSON text in a draft until an explicit commit', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    const initial = createPageDataText('Alpha', true)
    const next = createPageDataText('Draft', true)

    // Provide empty content for all 4 files to avoid background load failures
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_CONFIG_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })
    state.setPageFileText('pagedata.json', initial)

    const scope = effectScope()
    try {
      scope.run(() => {
        const editor = useDevFileEditor(state, ref<PageConfigFileName>('pagedata.json'))
        const initialCanonical = canonicalizePageDataJson(initial).text

        editor.updateText('{"dataSetName":')

        expect(editor.text.value).toBe('{"dataSetName":')
        expect(state.getPageFileText('pagedata.json')).toBe(initialCanonical)
        expect(state.getPageFileParseError('pagedata.json')).toBeNull()
        expect(editor.isDirty.value).toBe(true)

        // V3.1: invalid JSON in setText throws instead of tracking parse errors
        expect(() => editor.commitText()).toThrow()
        expect(editor.text.value).toBe('{"dataSetName":')
        expect(state.getPageFileText('pagedata.json')).toBe(initialCanonical)

        editor.updateText(next)
        expect(editor.commitText()).toBe(true)
        expect(editor.text.value).toBe(canonicalizePageDataJson(next).text)
        expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(next).text)
      })
    } finally {
      scope.stop()
    }
  })

  it('designer-level mutate reflects in text and is undoable', async () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    state.setPageFileText('pagedata.json', createPageDataText('Live', true))

    await state.editDataSet((tool) => {
      tool.createColumn({ tableName: 'Orders', column: { name: 'status', type: 'string' } })
    })

    expect(state.getPageFileText('pagedata.json')).toContain('status')
    expect(state.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()

    expect(state.undoPageFile('pagedata.json')).toBe(true)
    expect(state.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeUndefined()

    expect(state.redoPageFile('pagedata.json')).toBe(true)
    expect(state.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()
  })

  it('page switch resets all documents', () => {
    const state = useDevState()
    state.selectPage('orders-page')
    state.setPageFileText('pagedata.json', createPageDataText('PageA', true))
    state.setPageFileText('script.js', '// a\n')

    expect(state.getDataSetTool()).not.toBeNull()
    expect(state.getPageFileText('script.js')).toBe('// a\n')

    state.selectPage('orders-page-v2')

    expect(state.activePageId.value).toBe('orders-page-v2')
    // In V3.1, sub-models are always initialized; isLoaded distinguishes loaded vs unloaded
    expect(state.getNodeTree()).not.toBeNull()
    expect(state.getDataSetTool()).not.toBeNull()
    for (const name of PAGE_CONFIG_FILE_NAMES) {
      expect(state.isDocumentDirty(name)).toBe(false)
      expect(state.getPageFileLoadState(name)).toBe('idle')
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

    expect(state.isDocumentDirty('rule.json')).toBe(false)
    expect(state.canUndoPageFile('rule.json')).toBe(false)

    state.setPageFileText('rule.json', `${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    expect(state.isDocumentDirty('rule.json')).toBe(true)
    expect(state.canUndoPageFile('rule.json')).toBe(true)

    expect(state.undoPageFile('rule.json')).toBe(true)
    // undo always marks dirty in V3.1 single-track model
    expect(state.isDocumentDirty('rule.json')).toBe(true)
    expect(state.canUndoPageFile('rule.json')).toBe(false)
    expect(state.getPageFileText('rule.json')).toBe(initial)
  })

  it('pageDataDirty mirrors pagedata document dirty flag', () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'
    expect(state.pageDataDirty.value).toBe(false)
    state.setPageFileText('pagedata.json', createPageDataText('Dirty', true))
    expect(state.pageDataDirty.value).toBe(true)
  })

})
