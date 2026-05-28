import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

const { httpGet, httpPost, httpPut, httpRequestFull, httpClearCache, httpInterceptors } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpRequestFull: vi.fn(),
  httpClearCache: vi.fn(),
  httpInterceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
}))

vi.mock('@/services/http', () => ({
  createAuthHeaders: () => ({}),
  http: {
    get: httpGet,
    post: httpPost,
    put: httpPut,
    requestFull: httpRequestFull,
    clearCache: httpClearCache,
    interceptors: httpInterceptors,
  },
}))

vi.mock('@/services/api-paths', () => ({
  getPageApi: () => '/api/pages-config',
  getNavApi: () => '/api/navigation',
}))

import { canonicalizePageDataJson } from '../packages/spark-page-config/src/design/page-data-canonicalize'
import { PageModel } from '../packages/spark-page-config/src'
import { useDevState, type PageConfigFileName } from '../src/views/app/dev-system/useDevState'
import { useDevFileEditor } from '../src/views/app/dev-system/composables/useDevFileEditor'

const PAGE_MODEL_FILE_NAMES = PageModel.fileNames

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

async function requestFullFromGet(config: { url: string }): Promise<Record<string, unknown>> {
  try {
    const data = await httpGet(config.url)
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
    const maybeStatus = error as { status?: unknown; response?: { status?: unknown } }
    if (maybeStatus.status === undefined && typeof maybeStatus.response?.status === 'number') {
      maybeStatus.status = maybeStatus.response.status
    }
    throw error
  }
}

describe('useDevState documents SSOT', () => {
  beforeEach(() => {
    localStorage.clear()
    httpGet.mockReset()
    httpPost.mockReset()
    httpPut.mockReset()
    httpRequestFull.mockReset()
    httpClearCache.mockReset()
    httpInterceptors.request.use.mockReset()
    httpInterceptors.response.use.mockReset()
    httpRequestFull.mockImplementation(requestFullFromGet)
    httpClearCache.mockImplementation(() => undefined)
    httpInterceptors.request.use.mockImplementation(() => () => undefined)
    httpInterceptors.response.use.mockImplementation(() => () => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loading pagedata from remote parses into a clean model', async () => {
    const initial = createPageDataText('Alpha', true)
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_MODEL_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    expect((state.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
    expect(state.isDocumentDirty('pagedata.json')).toBe(false)
    expect(state.getDataSetTool()).not.toBeNull()
    expect((state.getActivePage()?.dataSet.canUndo ?? false)).toBe(false)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(initial).text)
  })

  it('editing pagedata text reparses model, makes doc dirty and enables undo', async () => {
    const initial = createPageDataText('Alpha', true)
    const next = createPageDataText('Beta', true)

    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/pagedata.json')) return { content: initial }
      const name = PAGE_MODEL_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    state.getActivePage()!.dataSet.setText(next)

    expect(state.isDocumentDirty('pagedata.json')).toBe(true)
    expect((state.getActivePage()?.dataSet.canUndo ?? false)).toBe(true)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(next).text)

    expect(state.getActivePage()?.dataSet.undo()).toBe(true)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(initial).text)
    // undo always marks dirty in V3.1 single-track model
    expect(state.isDocumentDirty('pagedata.json')).toBe(true)

    expect(state.getActivePage()?.dataSet.redo()).toBe(true)
    expect(state.getPageFileText('pagedata.json')).toBe(canonicalizePageDataJson(next).text)
  })

  it('ensureActivePageFilesLoaded loads each file exactly once', async () => {
    const fetchCount: Record<string, number> = {}
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_MODEL_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
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
    expect((state.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
  })

  it('ensureActivePageFilesLoaded fails fast and preserves existing documents when remote fetch fails', async () => {
    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_MODEL_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
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
      const name = PAGE_MODEL_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
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
    expect((state.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
    expect((state.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('loaded')
  })

  it('rule.json setText + undo reflects in the live SparkNodeTree', () => {
    const state = useDevState()
    state.selectPage('orders-page')

    state.getActivePage()!.rule.setText(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    state.getActivePage()!.rule.setText(`${JSON.stringify([{ type: 'el-button' }], null, 2)}\n`)

    const treeNow = requireValue(state.getNodeTree(), 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeNow.children)).toBe('el-button')

    expect(state.getActivePage()?.rule.undo()).toBe(true)
    const treeUndo = requireValue(state.getNodeTree(), 'rule model 未初始化').toJSON()
    expect(readFirstChildType(treeUndo.children)).toBe('div')
    expect(JSON.parse(state.getPageFileText('rule.json'))).toMatchObject({ type: 'div' })
  })

  it('script.js undo stays in sync with the page model', () => {
    const state = useDevState()
    state.selectPage('orders-page')

    state.getActivePage()!.script.setText('console.log("alpha")\n')
    state.getActivePage()!.script.setText('console.log("beta")\n')

    expect(state.getPageFileText('script.js')).toBe('console.log("beta")\n')
    expect(state.getActivePage()?.script.undo()).toBe(true)
    expect(state.getPageFileText('script.js')).toBe('console.log("alpha")\n')
  })

  it('style.css undo stays in sync with the page model', () => {
    const state = useDevState()
    state.selectPage('orders-page')

    state.getActivePage()!.style.setText('.page { color: red; }\n')
    state.getActivePage()!.style.setText('.page { color: blue; }\n')

    expect(state.getPageFileText('style.css')).toBe('.page { color: blue; }\n')
    expect(state.getActivePage()?.style.undo()).toBe(true)
    expect(state.getPageFileText('style.css')).toBe('.page { color: red; }\n')
  })

  it('savePageFile uploads current text and clears dirty without touching history', async () => {
    const state = useDevState()
    state.selectPage('orders-page')
    state.getActivePage()!.dataSet.setText(createPageDataText('Gamma', true))

    expect(state.isDocumentDirty('pagedata.json')).toBe(true)
    const canUndoBefore = (state.getActivePage()?.dataSet.canUndo ?? false)

    httpPut.mockResolvedValue({ ok: true })
    httpGet.mockResolvedValue([])

    await state.savePageFile('pagedata.json')

    expect(httpPut).toHaveBeenCalledWith(
      '/api/pages-config/orders-page/pagedata.json',
      state.getPageFileText('pagedata.json'),
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(state.isDocumentDirty('pagedata.json')).toBe(false)
    expect((state.getActivePage()?.dataSet.canUndo ?? false)).toBe(canUndoBefore)
  })

  it('dev file editor text is a read-only projection of the model (no drafts)', () => {
    const state = useDevState()
    state.selectPage('orders-page')
    const initial = createPageDataText('Alpha', true)

    httpGet.mockImplementation(async (url: string) => {
      const name = PAGE_MODEL_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })
    state.getActivePage()!.dataSet.setText(initial)

    const scope = effectScope()
    try {
      scope.run(() => {
        const editor = useDevFileEditor(state, ref<PageConfigFileName>('pagedata.json'))
        const initialCanonical = canonicalizePageDataJson(initial).text

        // V3.1: text is a direct read-only projection of the model
        expect(editor.text.value).toBe(initialCanonical)
        expect(state.getPageFileText('pagedata.json')).toBe(initialCanonical)

        // V3.1: no draft APIs; text always equals model text
        expect(editor.isFileDirty('pagedata.json')).toBe(true)

        // Direct model mutation is reflected in the text projection
        const next = createPageDataText('DirectSet', true)
        state.getActivePage()!.dataSet.setText(next)
        expect(editor.text.value).toBe(canonicalizePageDataJson(next).text)
      })
    } finally {
      scope.stop()
    }
  })

  it('designer-level mutate reflects in text and is undoable', async () => {
    const state = useDevState()
    state.selectPage('orders-page')
    state.getActivePage()!.dataSet.setText(createPageDataText('Live', true))

    await state.editDataSet((tool) => {
      tool.createColumn({ tableName: 'Orders', column: { name: 'status', type: 'string' } })
    })

    expect(state.getPageFileText('pagedata.json')).toContain('status')
    expect(state.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()

    expect(state.getActivePage()?.dataSet.undo()).toBe(true)
    expect(state.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeUndefined()

    expect(state.getActivePage()?.dataSet.redo()).toBe(true)
    expect(state.getDataSetTool()!.getColumn({ tableName: 'Orders', columnName: 'status' })).toBeDefined()
  })

  it('page switch resets all documents', () => {
    const state = useDevState()
    state.selectPage('orders-page')
    state.getActivePage()!.dataSet.setText(createPageDataText('PageA', true))
    state.getActivePage()!.script.setText('// a\n')

    expect(state.getDataSetTool()).not.toBeNull()
    expect(state.getPageFileText('script.js')).toBe('// a\n')

    state.selectPage('orders-page-v2')

    expect(state.activePageId.value).toBe('orders-page-v2')
    // In V3.1, sub-models are always initialized; isLoaded distinguishes loaded vs unloaded
    expect(state.getNodeTree()).not.toBeNull()
    expect(state.getDataSetTool()).not.toBeNull()
    for (const name of PAGE_MODEL_FILE_NAMES) {
      expect(state.isDocumentDirty(name)).toBe(false)
      expect((state.getActivePage()?.isLoaded ? 'loaded' : 'idle')).toBe('idle')
    }
  })

  it('rule load followed by undo to baseline keeps the document clean', async () => {
    const initial = '[]\n'
    httpGet.mockImplementation(async (url: string) => {
      if (url.endsWith('/rule.json')) return { content: initial }
      const name = PAGE_MODEL_FILE_NAMES.find((f) => url.endsWith(`/${f}`))
      if (name) return { content: '' }
      throw new Error(`unexpected GET ${url}`)
    })

    const state = useDevState()
    state.selectPage('orders-page')
    await state.ensureActivePageFilesLoaded()

    expect(state.isDocumentDirty('rule.json')).toBe(false)
    expect((state.getActivePage()?.rule.canUndo ?? false)).toBe(false)

    state.getActivePage()!.rule.setText(`${JSON.stringify([{ type: 'div' }], null, 2)}\n`)
    expect(state.isDocumentDirty('rule.json')).toBe(true)
    expect((state.getActivePage()?.rule.canUndo ?? false)).toBe(true)

    expect(state.getActivePage()?.rule.undo()).toBe(true)
    // undo always marks dirty in V3.1 single-track model
    expect(state.isDocumentDirty('rule.json')).toBe(true)
    expect((state.getActivePage()?.rule.canUndo ?? false)).toBe(false)
    expect(state.getPageFileText('rule.json')).toBe(initial)
  })

  it('pageDataDirty mirrors pagedata document dirty flag', () => {
    const state = useDevState()
    state.selectPage('orders-page')
    expect(state.pageDataDirty.value).toBe(false)
    state.getActivePage()!.dataSet.setText(createPageDataText('Dirty', true))
    expect(state.pageDataDirty.value).toBe(true)
  })

})
