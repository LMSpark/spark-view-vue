/**
 * Phase 8 测试 — S4 (ITableMetadata 组合), L4 (schemaVersion)
 */
import { describe, it, expect } from 'vitest'
import { DataSet } from '../dataset'
import { DataTable } from '../data-table'
import type { ITableMetadata, ITableOwnMetadata, IViewMetadata, IDataSetMetadata } from '../types'

// ============================================================
// S4: ITableMetadata = ITableOwnMetadata & IViewMetadata (组合)
// ============================================================
describe('S4: ITableMetadata composition (not inheritance)', () => {
  it('ITableMetadata should be assignable as IViewMetadata (structural compat)', () => {
    const tableMeta: ITableMetadata = {
      tableName: 'Users',
      columns: [{ name: 'id', type: 'number', label: 'ID' }],
      api: undefined,
      views: undefined,
      loading: undefined,
      error: undefined,
      rows: [{ id: 1 }],
      page: 1,
      pageSize: 20,
    }
    // 可以赋值给 IViewMetadata（组合后仍然满足结构子类型）
    const viewMeta: IViewMetadata = tableMeta
    expect(viewMeta.rows).toEqual([{ id: 1 }])
    expect(viewMeta.page).toBe(1)
  })

  it('ITableOwnMetadata should only contain table-level fields', () => {
    const own: ITableOwnMetadata = {
      tableName: 'Test',
      columns: [],
      api: undefined,
      views: undefined,
      loading: undefined,
      error: undefined,
    }
    // 不应包含 rows/page/filter 等视图字段
    expect(own).not.toHaveProperty('rows')
    expect(own).not.toHaveProperty('page')
    expect(own).not.toHaveProperty('filterExpression')
  })

  it('DataTable.toData() should return valid ITableMetadata (composition)', () => {
    const t = new DataTable('Products', [{ name: 'id', type: 'number', label: 'ID' }])
    const dv = t.getOrCreateView('default')
    dv.rows = [{ id: 1 }, { id: 2 }]

    const data = t.toData()
    // 表自有字段
    expect(data.tableName).toBe('Products')
    expect(data.columns).toHaveLength(1)
    // 视图字段（从 default 视图提升）
    expect(data.rows).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('DataTable.fromTableData() should handle flat view fields (backward compat)', () => {
    const data: ITableMetadata = {
      tableName: 'Orders',
      columns: [{ name: 'oid', type: 'string', label: 'OID' }],
      api: undefined,
      views: undefined,
      loading: undefined,
      error: undefined,
      rows: [{ oid: 'A' }],
      autoCurrentFirst: true,
      page: 2,
      pageSize: 10,
    }
    const table = DataTable.fromTableData(data)
    const dv = table.getOrCreateView('default')
    expect(dv.rows).toEqual([{ oid: 'A' }])
    expect(dv.page).toBe(2)
    expect(dv.pageSize).toBe(10)
    expect(dv.autoCurrentFirst).toBe(true)
  })

  it('DataTable.fromTableData() should prefer views.default config over flat fields', () => {
    const data: ITableMetadata = {
      tableName: 'T',
      columns: [],
      api: undefined,
      views: {
        default: { page: 5, pageSize: 50, autoCurrentFirst: false },
      },
      loading: undefined,
      error: undefined,
      // 表级字段（应被忽略 — views.default 优先）
      rows: [{ x: 1 }],
      page: 1,
      pageSize: 20,
    }
    const table = DataTable.fromTableData(data)
    const dv = table.getOrCreateView('default')
    // rows 来自表级 data.rows（fromTableData 固定行为）
    expect(dv.rows).toEqual([{ x: 1 }])
    // config 字段优先取 views.default
    expect(dv.page).toBe(5)
    expect(dv.pageSize).toBe(50)
  })
})

// ============================================================
// L4: schemaVersion
// ============================================================
describe('L4: schemaVersion in IDataSetMetadata', () => {
  it('DataSet should default schemaVersion to 1', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'Test',
      tables: { T: { tableName: 'T', columns: [], rows: [] } },
    })
    expect(ds.schemaVersion).toBe(1)
  })

  it('DataSet constructor should accept explicit schemaVersion', () => {
    const ds = new DataSet({
      dataSetName: 'Versioned',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: undefined,
          views: undefined,
          loading: undefined,
          error: undefined,
        },
      },
      schemaVersion: 2,
    })
    expect(ds.schemaVersion).toBe(2)
  })

  it('toData() should include schemaVersion', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'S',
      tables: {},
    })
    const data = ds.toData()
    expect(data.schemaVersion).toBe(1)
  })

  it('fromData() roundtrip should preserve schemaVersion', () => {
    const ds1 = new DataSet({
      dataSetName: 'RT',
      tables: { T: { tableName: 'T', columns: [], api: undefined, views: undefined, loading: undefined, error: undefined } },
      schemaVersion: 3,
      version: 42,
    })
    const json = JSON.stringify(ds1)
    const ds2 = DataSet.fromJSON(json)
    expect(ds2.schemaVersion).toBe(3)
    expect(ds2.version).toBe(42)
  })

  it('fromData() should default schemaVersion to 1 when missing', () => {
    const raw: IDataSetMetadata = {
      dataSetName: 'Old',
      tables: {},
      relations: undefined,
      version: undefined,
      pageId: undefined,
      // schemaVersion 未指定 — 旧 JSON 场景
    }
    const ds = DataSet.fromData(raw)
    expect(ds.schemaVersion).toBe(1)
  })

  it('schemaVersion should be distinct from business version', () => {
    const ds = new DataSet({
      dataSetName: 'Dual',
      tables: {},
      schemaVersion: 1,
      version: 99,
    })
    expect(ds.schemaVersion).toBe(1)  // schema 格式版本
    expect(ds.version).toBe(99)        // 业务乐观锁版本
    const data = ds.toData()
    expect(data.schemaVersion).toBe(1)
    expect(data.version).toBe(99)
  })
})
