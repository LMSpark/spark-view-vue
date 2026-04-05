import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
}))

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

import { canonicalizePageDataJson } from '../src/views/app/dev-system/pageDataJsonSchema'
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
    await state.loadPageFiles('orders-page')

    expect(state.pageDataHistory.value).toHaveLength(1)
    expect(state.pageDataHistoryActiveIndex.value).toBe(0)
    expect(state.fileDirty['pagedata.json']).toBe(false)

    const editedPageDataText = createPageDataText('Beta', true)
    state.updatePageFile('pagedata.json', editedPageDataText)

    expect(state.pageDataHistory.value).toHaveLength(1)
    expect(state.pageDataHistoryActiveIndex.value).toBe(-1)
    expect(state.goPageDataHistoryBack()).toBe(true)
    expect(state.editFiles['pagedata.json']).toBe(canonicalizePageDataJson(initialPageDataText).text)
    expect(state.goPageDataHistoryForward()).toBe(true)
    expect(state.editFiles['pagedata.json']).toBe(canonicalizePageDataJson(editedPageDataText).text)
  })

  it('does not append local history on save because save only uploads to backend', async () => {
    const state = useDevState()
    state.activePageId.value = 'orders-page'

    const editedPageDataText = createPageDataText('Gamma', true)
    state.updatePageFile('pagedata.json', editedPageDataText)

    const historyCountBeforeSave = state.pageDataHistory.value.length
    const latestEntryIdBeforeSave = state.pageDataHistory.value[0]?.id
    httpPut.mockResolvedValue({ ok: true })

    await state.savePageFiles()

    expect(httpPut).toHaveBeenCalledWith(
      '/api/pages-config/orders-page/pagedata.json',
      canonicalizePageDataJson(editedPageDataText).text,
      { headers: { 'Content-Type': 'text/plain' } },
    )
    expect(state.pageDataHistory.value).toHaveLength(historyCountBeforeSave)
    expect(state.pageDataHistory.value[0]?.id).toBe(latestEntryIdBeforeSave)
    expect(state.fileDirty['pagedata.json']).toBe(false)
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
    await state.loadPageFiles('orders-page')

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
    expect(state.pageDataHistory.value).toHaveLength(1)

    state.updatePageFile('pagedata.json', createPageDataText('Snapshot-2', true))
    expect(state.pageDataHistory.value).toHaveLength(1)

    vi.advanceTimersByTime(5001)
    state.updatePageFile('pagedata.json', createPageDataText('Snapshot-3', true))

    expect(state.pageDataHistory.value).toHaveLength(2)
    expect(state.pageDataHistory.value.map((entry) => entry.version)).toEqual([2, 1])
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

    await state.saveByTab('script.js')

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

    for (let index = 1; index <= 21; index += 1) {
      if (index > 1) {
        vi.advanceTimersByTime(5001)
      }
      state.updatePageFile('pagedata.json', createPageDataText(`Snapshot-${index}`, true))
    }

    expect(state.pageDataHistory.value).toHaveLength(20)
    expect(state.pageDataHistory.value.map((entry) => entry.version)).toEqual(
      Array.from({ length: 20 }, (_, offset) => 21 - offset),
    )

    for (let step = 0; step < 19; step += 1) {
      expect(state.goPageDataHistoryBack()).toBe(true)
    }

    expect(state.editFiles['pagedata.json']).toBe(canonicalizePageDataJson(createPageDataText('Snapshot-2', true)).text)
    expect(state.goPageDataHistoryBack()).toBe(false)
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