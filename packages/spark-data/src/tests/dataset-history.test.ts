import { describe, expect, it } from 'vitest'
import {
  DataSet,
  formatPageDataHistoryEntry,
  getDataSetHistoryEntry,
  listDataSetHistory,
} from '@spark-view/spark-data'

type MemoryStorageMap = Map<string, string>

function createMemoryHistoryAdapter(backingStore: MemoryStorageMap) {
  return {
    getItem(key: string): string | null {
      return backingStore.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      backingStore.set(key, value)
    },
    removeItem(key: string): void {
      backingStore.delete(key)
    },
  }
}

function createCanonicalPageData(name: string) {
  return {
    dataset: {
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
    },
  }
}

describe('DataSet history/version', () => {
  it('should commit page data history into adapter with incrementing versions', () => {
    const storage = new Map<string, string>()
    const adapter = createMemoryHistoryAdapter(storage)
    const pageId = 'orders-page'

    const firstPageData = createCanonicalPageData('Alice')
    const dataSet = DataSet.fromPageData(firstPageData)
    dataSet.pageId = pageId

    const firstEntry = dataSet.commitVersion({
      adapter,
      scopeId: pageId,
      pageId,
      label: 'initial',
      summary: 'first save',
      sourceData: firstPageData,
    })

    expect(firstEntry.version).toBe(1)
    expect(dataSet.version).toBe(1)

    const secondPageData = createCanonicalPageData('Bob')
    dataSet.replaceFromPageData(secondPageData)
    dataSet.pageId = pageId
    const secondEntry = dataSet.commitVersion({
      adapter,
      scopeId: pageId,
      pageId,
      label: 'update',
      summary: 'second save',
      sourceData: secondPageData,
    })

    expect(secondEntry.version).toBe(2)
    expect(dataSet.version).toBe(2)

    const history = listDataSetHistory({ pageId, scopeId: pageId }, { adapter })
    expect(history).toHaveLength(2)
    expect(history.map((entry) => entry.version)).toEqual([2, 1])

    const restoredText = formatPageDataHistoryEntry(history[1]!)
    expect(JSON.parse(restoredText)).toEqual(firstPageData)
  })

  it('should restore a previous version into the same DataSet instance', () => {
    const storage = new Map<string, string>()
    const adapter = createMemoryHistoryAdapter(storage)
    const pageId = 'orders-restore-page'

    const firstPageData = createCanonicalPageData('Alpha')
    const dataSet = DataSet.fromPageData(firstPageData)
    dataSet.pageId = pageId
    dataSet.commitVersion({ adapter, scopeId: pageId, pageId, sourceData: firstPageData })

    const secondPageData = createCanonicalPageData('Beta')
    dataSet.replaceFromPageData(secondPageData)
    dataSet.pageId = pageId
    dataSet.commitVersion({ adapter, scopeId: pageId, pageId, sourceData: secondPageData })

    const previousEntry = getDataSetHistoryEntry({ pageId, scopeId: pageId }, { version: 1 }, { adapter })
    expect(previousEntry?.version).toBe(1)

    const restored = dataSet.restoreVersion({ version: 1 }, { adapter, scopeId: pageId })
    expect(restored?.version).toBe(1)
    expect(dataSet.version).toBe(1)
    expect(dataSet.toData().tables['Orders']?.views.default.rows?.[0]?.['name']).toBe('Alpha')
  })
})