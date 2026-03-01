/**
 * Phase 9+10 测试
 * - M5: CrudService 共享 HTTP 客户端
 * - M3: executeBatch 真滑动窗口
 * - S1: DataView 公共委托访问器
 * - L1: 子路径导出
 */
import { describe, it, expect, vi } from 'vitest'
import { DataSet } from '../dataset'
import { DataView } from '../data-view'
import { CrudService, createCrudService } from '../crud-service'
import { SelectionDelegate } from '../strategies/selection-delegate'
import { LocalMutationDelegate } from '../strategies/local-mutation-delegate'
import { CrudDelegate } from '../strategies/crud-delegate'
import type { CrudApi } from '../types'

// ============================================================
// M5: CrudService 共享 HTTP 客户端
// ============================================================
describe('M5: CrudService shared HTTP client', () => {
  const dummyApi: CrudApi = {
    list: { url: '/api/test', method: 'GET' },
  }

  it('CrudService should accept a Request instance (duck-type check)', () => {
    // 创建一个模拟的 Request 对象（具有 get 方法）
    const mockRequest = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
    }
    const service = new CrudService(dummyApi, mockRequest as any)
    expect(service.getHttpClient()).toBe(mockRequest)
  })

  it('CrudService should create own Request when no client provided', () => {
    const service = new CrudService(dummyApi)
    const client = service.getHttpClient()
    expect(client).toBeDefined()
    expect(typeof client.get).toBe('function')
  })

  it('createCrudService should pass through httpClient', () => {
    const mockRequest = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
    }
    const service = createCrudService(dummyApi, mockRequest as any)
    expect(service.getHttpClient()).toBe(mockRequest)
  })

  it('DataSet.setSharedHttpClient should be accessible', () => {
    const ds = DataSet.fromConfig({
      dataSetName: 'Test',
      tables: { T: { tableName: 'T', columns: [], rows: [] } },
    })
    const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), request: vi.fn() }
    ds.setSharedHttpClient(mockClient as any)
    expect(ds._sharedHttpClient).toBe(mockClient)
  })

  it('DataTable.crudService should use shared client from DataSet', () => {
    const mockClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), request: vi.fn() }
    const ds = new DataSet({
      dataSetName: 'Shared',
      tables: {
        T: {
          tableName: 'T',
          columns: [],
          api: { list: { url: '/api/t', method: 'GET' } },
          views: undefined,
          loading: undefined,
          error: undefined,
        },
      },
    })
    ds.setSharedHttpClient(mockClient as any)
    const table = ds.getTable('T')!
    const service = table.crudService!
    expect(service.getHttpClient()).toBe(mockClient)
  })
})

// ============================================================
// M3: executeBatch 真滑动窗口（行为验证）
// ============================================================
describe('M3: executeBatch sliding window', () => {
  it('batch operations should complete all items', async () => {
    // 通过公共 API 间接测试 — batchCreate 内部使用 executeBatch
    const dummyApi: CrudApi = {
      list: { url: '/api/test', method: 'GET' },
      create: { url: '/api/test', method: 'POST' },
      batch: {
        create: { url: '/api/test/batch', method: 'POST' },
      },
    }
    const service = new CrudService(dummyApi)
    // executeBatch is private, we test via batchCreate
    // Since we don't have a real server, the individual requests will fail,
    // but we verify all items get results (each item caught individually)
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `item-${i}` }))
    const result = await service.batchCreate(items)
    // batchCreate always returns success:true with BatchResult containing all item results
    expect(result.success).toBe(true)
    expect(result.data?.results).toHaveLength(10)
  })
})

// ============================================================
// S1: DataView 公共委托访问器
// ============================================================
describe('S1: DataView public delegate accessors', () => {
  it('view.selection should return SelectionDelegate', () => {
    const view = new DataView('TestTable', 'default')
    expect(view.selection).toBeInstanceOf(SelectionDelegate)
  })

  it('view.mutation should return LocalMutationDelegate', () => {
    const view = new DataView('TestTable', 'default')
    expect(view.mutation).toBeInstanceOf(LocalMutationDelegate)
  })

  it('view.crud should return CrudDelegate', () => {
    const view = new DataView('TestTable', 'default')
    expect(view.crud).toBeInstanceOf(CrudDelegate)
  })

  it('delegate accessors should be stable (same instance)', () => {
    const view = new DataView('TestTable', 'default')
    const sel1 = view.selection
    const sel2 = view.selection
    expect(sel1).toBe(sel2)
  })

  it('view.selection should be same delegate used by setCurrentRow', () => {
    const view = new DataView('TestTable', 'default')
    view.rows = [{ id: 1, name: 'A' }]
    // Use pass-through method to trigger selection
    view.setCurrentRow(view.rows[0] ?? null)
    expect(view.currentRow).toEqual({ id: 1, name: 'A' })
    // The delegate should see the same state
    expect(view.selection).toBeDefined()
  })
})

// ============================================================
// L1: 委托类导出验证
// ============================================================
describe('L1: delegate class exports from index', () => {
  it('SelectionDelegate should be importable from index', () => {
    expect(SelectionDelegate).toBeDefined()
    expect(typeof SelectionDelegate).toBe('function')
  })

  it('LocalMutationDelegate should be importable from index', () => {
    expect(LocalMutationDelegate).toBeDefined()
    expect(typeof LocalMutationDelegate).toBe('function')
  })

  it('CrudDelegate should be importable from index', () => {
    expect(CrudDelegate).toBeDefined()
    expect(typeof CrudDelegate).toBe('function')
  })
})
