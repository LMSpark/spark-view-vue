/**
 * ViewKey / DataKey 绑定规则测试。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { DataSet, RequestState, SparkData } from '@spark-view/spark-data'
import {
  buildDataKey,
  buildViewKey,
  deriveDataKeyFromViewKey,
  diagnoseDataKey,
  diagnoseViewKey,
  getViewKey,
  isDataKey,
  isViewKey,
  parseDataKey,
  parseViewKey,
  resolveDataKey,
  resolveDataKeyBinding,
  resolveRawKey,
  resolveViewKey,
} from '@spark-view/spark-data'

function createFixtureDataSet(): DataSet {
  return SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', label: 'ID' },
          { name: 'name', type: 'string', label: '姓名' },
          { name: 'amount', type: 'number', label: '金额' },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '张三', amount: 10 },
              { id: 2, name: '李四', amount: 20 },
            ],
            aggregates: {
              totalAmount: { type: 'sum', field: 'amount' },
            },
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
          grid: {
            rows: [
              { id: 3, name: '王五', amount: 30 },
            ],
            autoCurrentFirst: false,
            autoSelectFirst: false,
          },
        },
      },
    },
  })
}

describe('ViewKey', () => {
  it('parses page-local view keys', () => {
    expect(parseViewKey('Orders@default')).toEqual({
      tableName: 'Orders',
      viewId: 'default',
      raw: 'Orders@default',
    })
    expect(parseViewKey('Orders@grid')).toEqual({
      tableName: 'Orders',
      viewId: 'grid',
      raw: 'Orders@grid',
    })
  })

  it('parses scoped view keys', () => {
    expect(parseViewKey('#SharedDS@Orders@grid')).toEqual({
      scope: 'SharedDS',
      tableName: 'Orders',
      viewId: 'grid',
      raw: '#SharedDS@Orders@grid',
      crossPage: true,
    })
  })

  it('rejects data keys and malformed keys', () => {
    expect(parseViewKey('Orders@grid@rows')).toBeNull()
    expect(parseViewKey('Orders')).toBeNull()
    expect(parseViewKey('#SharedDS@Orders')).toBeNull()
    expect(isViewKey('Orders@grid')).toBe(true)
    expect(isViewKey('Orders@grid@rows')).toBe(false)
  })

  it('resolves views and diagnoses failures', () => {
    const dataSet = createFixtureDataSet()
    expect(resolveViewKey('Users@default', dataSet)?.viewId).toBe('default')
    expect(resolveViewKey('Users@grid', dataSet)?.rows).toHaveLength(1)
    expect(diagnoseViewKey('Users@default', dataSet).status).toBe('ok')
    expect(diagnoseViewKey('Users@missing', dataSet).status).toBe('missing-view')
    expect(diagnoseViewKey('Missing@default', dataSet).status).toBe('missing-table')
    expect(diagnoseViewKey('Users@default', null).status).toBe('missing-dataset')
  })

  it('builds view keys', () => {
    expect(buildViewKey('Users')).toBe('Users@default')
    expect(buildViewKey('Users', 'grid')).toBe('Users@grid')
    expect(buildViewKey('Users', 'grid', 'SharedDS')).toBe('#SharedDS@Users@grid')
  })
})

describe('DataKey', () => {
  it('requires explicit viewId', () => {
    expect(parseDataKey('Users@rows')).toBeNull()
    expect(isDataKey('Users@rows')).toBe(false)
    expect(diagnoseDataKey('Users@rows', createFixtureDataSet()).status).toBe('invalid-key')
  })

  it('parses page-local data keys', () => {
    expect(parseDataKey('Users@grid@rows')).toEqual({
      tableName: 'Users',
      viewId: 'grid',
      field: 'rows',
      raw: 'Users@grid@rows',
    })
    expect(parseDataKey('Users@default@currentRow.name')).toEqual({
      tableName: 'Users',
      viewId: 'default',
      field: 'currentRow',
      fieldPath: 'name',
      raw: 'Users@default@currentRow.name',
    })
  })

  it('parses scoped data keys', () => {
    expect(parseDataKey('#SharedDS@Users@grid@aggregateResult.totalAmount')).toEqual({
      scope: 'SharedDS',
      tableName: 'Users',
      viewId: 'grid',
      field: 'aggregateResult',
      fieldPath: 'totalAmount',
      raw: '#SharedDS@Users@grid@aggregateResult.totalAmount',
      crossPage: true,
    })
  })

  it('supports the full value field set', () => {
    const fields = [
      'rows',
      'columns',
      'currentRow',
      'selectedRows',
      'aggregateResult',
      'selectionAggregateResult',
      'total',
      'page',
      'pageSize',
      'requestState',
      'mutating',
      'loadingError',
      'mutatingError',
    ] as const

    for (const field of fields) {
      expect(parseDataKey(`Users@default@${field}`)?.field).toBe(field)
    }
  })

  it('rejects malformed data keys', () => {
    expect(parseDataKey('Users@default@invalidField')).toBeNull()
    expect(parseDataKey('#DS@Users@rows')).toBeNull()
    expect(parseDataKey('#DS@Users@default')).toBeNull()
    expect(parseDataKey('dataset.tables.Users.rows')).toBeNull()
  })

  it('builds data keys with explicit viewId', () => {
    expect(buildDataKey('Users', 'rows')).toBe('Users@default@rows')
    expect(buildDataKey('Users', 'rows', 'grid')).toBe('Users@grid@rows')
    expect(buildDataKey('Users', 'rows', 'grid', 'SharedDS')).toBe('#SharedDS@Users@grid@rows')
    expect(deriveDataKeyFromViewKey('Users@grid', 'currentRow')).toBe('Users@grid@currentRow')
    expect(deriveDataKeyFromViewKey('#SharedDS@Users@grid', 'selectedRows')).toBe('#SharedDS@Users@grid@selectedRows')
  })

  it('extracts view identity from parsed keys', () => {
    expect(getViewKey(parseDataKey('Users@grid@rows')!)).toBe('Users.grid')
    expect(getViewKey(parseViewKey('#SharedDS@Users@grid')!)).toBe('Users.grid')
  })
})

describe('DataKey resolution', () => {
  let dataSet: DataSet

  beforeEach(() => {
    dataSet = createFixtureDataSet()
  })

  it('resolves rows as row arrays, not DataView', () => {
    const rows = resolveDataKey(parseDataKey('Users@default@rows')!, dataSet)
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toHaveLength(2)
  })

  it('resolves columns, pagination, request and mutation fields', () => {
    expect(resolveRawKey('Users@default@columns', dataSet)).toHaveLength(4)
    expect(resolveRawKey('Users@default@total', dataSet)).toBe(0)
    expect(resolveRawKey('Users@default@page', dataSet)).toBe(1)
    expect(resolveRawKey('Users@default@pageSize', dataSet)).toBe(20)
    expect(resolveRawKey('Users@default@requestState', dataSet)).toBe(RequestState.Idle)
    expect(resolveRawKey('Users@default@mutating', dataSet)).toBe(false)
    expect(resolveRawKey('Users@default@loadingError', dataSet)).toBeNull()
    expect(resolveRawKey('Users@default@mutatingError', dataSet)).toBeNull()
  })

  it('resolves currentRow and field paths', () => {
    const view = dataSet.getView('Users', 'default')!
    view.selection.setCurrentRowById(1)

    expect(resolveRawKey('Users@default@currentRow.name', dataSet)).toBe('张三')
    expect(resolveRawKey('Users@default@aggregateResult.totalAmount', dataSet)).toBe(30)
  })

  it('returns structured bindings with the owning source', () => {
    const binding = resolveDataKeyBinding('Users@default@rows', dataSet)
    expect(binding?.kind).toBe('value')
    expect(binding?.source.tableName).toBe('Users')
    expect(binding?.descriptor.field).toBe('rows')
    expect(Array.isArray(binding?.value)).toBe(true)
  })

  it('diagnoses field paths and empty row states', () => {
    expect(diagnoseDataKey('Users@default@currentRow.name', dataSet).status).toBe('empty-current-row')
    expect(diagnoseDataKey('Users@default@selectedRows', dataSet).status).toBe('empty-selection')

    const view = dataSet.getView('Users', 'default')!
    view.selection.setCurrentRowById(1)
    expect(diagnoseDataKey('Users@default@currentRow.missing', dataSet).status).toBe('missing-field')
    expect(diagnoseDataKey('Users@default@rows.id', dataSet).status).toBe('unsupported-field-path')
  })
})
