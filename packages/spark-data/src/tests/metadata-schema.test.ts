/**
 * Metadata schema 测试 — v2 canonical 结构
 */
import { describe, it, expect } from 'vitest'
import { DataSet } from '../dataset'
import { DataTable } from '../data-table'
import type { ITableMetadata, IViewMetadata, IDataSetMetadata } from '../types'

// ============================================================
// Table/View metadata 对齐
// ============================================================
describe('ITableMetadata canonical structure', () => {
  it('ITableMetadata should contain table fields and views only', () => {
    const tableMeta: ITableMetadata = {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'number', label: 'ID' }],
      views: {
        default: {
          rows: [{ id: 1 }],
          page: 1,
          pageSize: 20,
        },
      },
    }
    const viewMeta: IViewMetadata = tableMeta.views.default
    expect(viewMeta.rows).toEqual([{ id: 1 }])
    expect(viewMeta.page).toBe(1)
    expect(tableMeta).not.toHaveProperty('rows')
  })

  it('DataTable.toJson() should return valid ITableMetadata with default view under views', () => {
    const t = new DataTable('Products', [{ name: 'id', type: 'number', label: 'ID' }])
    const dv = t.getOrCreateView('default')
    dv.rows = [{ id: 1 }, { id: 2 }]

    const data = t.toJson()
    expect(data.tableName).toBe('Products')
    expect(data.columns).toHaveLength(1)
    expect(data.views.default.rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('DataTable semantic metadata should roundtrip through ITableMetadata', () => {
    const data: ITableMetadata = {
      tableName: 'OrderSummary',
      columns: [{ name: 'id', type: 'number', label: 'ID' }],
      resourceType: 'database-view',
      resourceId: 'vw_order_summary',
      businessCategory: 'reference',
      views: {
        default: {
          rows: [{ id: 1 }],
        },
      },
    }

    const table = DataTable.fromJson(data)
    expect(table.resourceType).toBe('database-view')
    expect(table.resourceId).toBe('vw_order_summary')
    expect(table.businessCategory).toBe('reference')

    const roundtrip = table.toJson()
    expect(roundtrip.resourceType).toBe('database-view')
    expect(roundtrip.resourceId).toBe('vw_order_summary')
    expect(roundtrip.businessCategory).toBe('reference')
  })

  it('DataTable.fromJson() should read default view from views.default', () => {
    const data: ITableMetadata = {
      tableName: 'Orders',
      columns: [{ name: 'oid', type: 'string', label: 'OID' }],
      views: {
        default: {
          rows: [{ oid: 'A' }],
          autoCurrentFirst: true,
          page: 2,
          pageSize: 10,
        },
      },
    }
    const table = DataTable.fromJson(data)
    const dv = table.getOrCreateView('default')
    expect(dv.rows).toEqual([{ oid: 'A' }])
    expect(dv.page).toBe(2)
    expect(dv.pageSize).toBe(10)
    expect(dv.autoCurrentFirst).toBe(true)
  })

  it('DataTable.fromJson() should keep named views independent from default view', () => {
    const data: ITableMetadata = {
      tableName: 'T',
      columns: [],
      views: {
        default: { rows: [{ x: 1 }], page: 5, pageSize: 50, autoCurrentFirst: false },
        grid: { rows: [{ x: 2 }], page: 2, pageSize: 10 },
      },
    }
    const table = DataTable.fromJson(data)
    const defaultView = table.getOrCreateView('default')
    const gridView = table.getOrCreateView('grid')
    expect(defaultView.rows).toEqual([{ x: 1 }])
    expect(defaultView.page).toBe(5)
    expect(gridView.rows).toEqual([{ x: 2 }])
    expect(gridView.page).toBe(2)
  })

  it('DataSet.fromJson() should move legacy default-view fields into views.default', () => {
    const ds = DataSet.fromJson({
      dataset: {
        dataSetName: 'LegacyDS',
        tables: {
          Users: {
            columns: [{ name: 'id', type: 'number', label: 'ID' }],
            rows: [{ id: 1 }],
            autoCurrentFirst: true,
            autoSelectFirst: true,
            page: 2,
            pageSize: 50,
          },
        },
      },
    })

    const data = ds.toJson()
    const table = data.tables['Users']
    expect(table?.views.default.rows).toEqual([{ id: 1 }])
    expect(table?.views.default.autoCurrentFirst).toBe(true)
    expect(table?.views.default.autoSelectFirst).toBe(true)
    expect(table?.views.default.page).toBe(2)
    expect(table?.views.default.pageSize).toBe(50)
    expect((table as unknown as Record<string, unknown>)['rows']).toBeUndefined()
    expect((table as unknown as Record<string, unknown>)['autoCurrentFirst']).toBeUndefined()
    expect((table as unknown as Record<string, unknown>)['autoSelectFirst']).toBeUndefined()
  })

  it('DataSet.fromJson() should accept direct root canonical dataset documents', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'RootDS',
      tables: {
        Users: {
          columns: [{ name: 'id', type: 'number', label: 'ID' }],
          views: {
            default: {
              rows: [{ id: 1 }],
            },
          },
        },
      },
    })

    expect(ds.dataSetName).toBe('RootDS')
    expect(ds.getTable('Users')?.getView('default')?.rows).toEqual([{ id: 1, _pk: 1 }])
    expect(ds.toJson().tables['Users']?.views.default.rows).toEqual([{ id: 1 }])
  })
})

// ============================================================
// L4: schemaVersion
// ============================================================
describe('L4: schemaVersion in IDataSetMetadata', () => {
  it('DataSet should default schemaVersion to 2', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'Test',
      tables: { T: { tableName: 'T', columns: [], views: { default: { rows: [] } } } },
    })
    expect(ds.schemaVersion).toBe(2)
  })

  it('DataSet constructor should accept explicit schemaVersion', () => {
    const ds = new DataSet({
      dataSetName: 'Versioned',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          views: { default: {} },
        },
      },
      schemaVersion: 2,
    })
    expect(ds.schemaVersion).toBe(2)
  })

  it('toJson() should include schemaVersion', () => {
    const ds = DataSet.fromJson({
      dataSetName: 'S',
      tables: {},
    })
    const data = ds.toJson()
    expect(data.schemaVersion).toBe(2)
  })

  it('fromJson() roundtrip should preserve schemaVersion', () => {
    const ds1 = new DataSet({
      dataSetName: 'RT',
      tables: { T: { tableName: 'T', columns: [], views: { default: {} } } },
      schemaVersion: 3,
      version: 42,
    })
    const json = JSON.stringify(ds1.toJson())
    const ds2 = DataSet.fromJson(json)
    expect(ds2.schemaVersion).toBe(3)
    expect(ds2.version).toBe(42)
  })

  it('fromJson() should default schemaVersion to 2 when missing', () => {
    const raw: IDataSetMetadata = {
      dataSetName: 'Old',
      tables: {},
      version: undefined,
      pageId: undefined,
      // schemaVersion 未指定 — 默认按 canonical v2 处理
    }
    const ds = DataSet.fromJson(raw)
    expect(ds.schemaVersion).toBe(2)
  })

  it('schemaVersion should be distinct from business version', () => {
    const ds = new DataSet({
      dataSetName: 'Dual',
      tables: {},
      schemaVersion: 2,
      version: 99,
    })
    expect(ds.schemaVersion).toBe(2)  // schema 格式版本
    expect(ds.version).toBe(99)        // 业务乐观锁版本
    const data = ds.toJson()
    expect(data.schemaVersion).toBe(2)
    expect(data.version).toBe(99)
  })
})
