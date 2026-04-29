import { describe, expect, it } from 'vitest'
import {
  commitDataSetSnapshot,
  DataSet,
  formatPageDataSnapshot,
  getDataSetSnapshot,
  listDataSetSnapshots,
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
}

describe('DataSet history/version', () => {
  it('should commit page data history into adapter with incrementing versions', () => {
    const storage = new Map<string, string>()
    const adapter = createMemoryHistoryAdapter(storage)
    const pageId = 'orders-page'

    const firstPageData = createCanonicalPageData('Alice')
    const dataSet = DataSet.fromJson(firstPageData)
    dataSet.pageId = pageId

    const firstEntry = dataSet.commitSnapshot({
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
    dataSet.replaceFromJson(secondPageData)
    dataSet.pageId = pageId
    const secondEntry = dataSet.commitSnapshot({
      adapter,
      scopeId: pageId,
      pageId,
      label: 'update',
      summary: 'second save',
      sourceData: secondPageData,
    })

    expect(secondEntry.version).toBe(2)
    expect(dataSet.version).toBe(2)

    const history = listDataSetSnapshots({ pageId, scopeId: pageId }, { adapter })
    expect(history).toHaveLength(2)
    expect(history.map((entry) => entry.version)).toEqual([2, 1])

    const restoredText = formatPageDataSnapshot(history[1]!)
    const restoredPageData = JSON.parse(restoredText) as {
      dataSetName?: string
      dataset?: unknown
      tables?: Record<string, { views?: { default?: { rows?: Array<Record<string, unknown>> } } }>
    }
    expect(restoredPageData.dataset).toBeUndefined()
    expect(restoredPageData.dataSetName).toBe('OrdersDS')
    expect(restoredPageData.tables?.['Orders']?.views?.default?.rows?.[0]?.['name']).toBe('Alice')
  })

  it('should restore a previous version into the same DataSet instance', () => {
    const storage = new Map<string, string>()
    const adapter = createMemoryHistoryAdapter(storage)
    const pageId = 'orders-restore-page'

    const firstPageData = createCanonicalPageData('Alpha')
    const dataSet = DataSet.fromJson(firstPageData)
    dataSet.pageId = pageId
    dataSet.commitSnapshot({ adapter, scopeId: pageId, pageId, sourceData: firstPageData })

    const secondPageData = createCanonicalPageData('Beta')
    dataSet.replaceFromJson(secondPageData)
    dataSet.pageId = pageId
    dataSet.commitSnapshot({ adapter, scopeId: pageId, pageId, sourceData: secondPageData })

    const previousEntry = getDataSetSnapshot({ pageId, scopeId: pageId }, { version: 1 }, { adapter })
    expect(previousEntry?.version).toBe(1)

    const restored = dataSet.restoreSnapshot({ version: 1 }, { adapter, scopeId: pageId })
    expect(restored?.version).toBe(1)
    expect(dataSet.version).toBe(1)
    expect(dataSet.toJson().tables['Orders']?.views.default.rows?.[0]?.['name']).toBe('Alpha')
  })

  it('should reuse fixed snapshot slots when history exceeds the max entries limit', () => {
    const storage = new Map<string, string>()
    const adapter = createMemoryHistoryAdapter(storage)
    const pageId = 'orders-ring-page'

    for (let version = 1; version <= 5; version += 1) {
      const snapshot = createCanonicalPageData(`User-${version}`)
      commitDataSetSnapshot(snapshot, {
        adapter,
        scopeId: pageId,
        pageId,
        sourceData: snapshot,
        maxEntries: 3,
        version,
        timestamp: version,
      })
    }

    const history = listDataSetSnapshots({ pageId, scopeId: pageId }, { adapter })
    expect(history).toHaveLength(3)
    expect(history.map((entry) => entry.version)).toEqual([5, 4, 3])

    const rawEnvelope = JSON.parse(storage.get('spark:data-history:orders-ring-page') ?? '{}') as {
      entries?: Array<{ version?: number }>
      nextSlot?: number
      capacity?: number
    }

    expect(rawEnvelope.capacity).toBe(3)
    expect(rawEnvelope.nextSlot).toBe(2)
    expect(Array.isArray(rawEnvelope.entries)).toBe(true)
    expect(rawEnvelope.entries?.length).toBe(3)
  })
})
