/**
 * 级联事件过滤 + 陈旧数据修复 的回归测试
 *
 * 覆盖两类 bug：
 *  1. 白请求风暴：子视图响应了与其 dependencyType 无关的父事件
 *  2. 陈旧数据：父的选中行在子 Loading 期间改变，子完成后数据仍是旧的
 */

import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '../packages/spark-data/src/spark-data'
import { RequestState } from '../packages/spark-data/src/data-view'
import type { ViewStateEvent, IDataRow } from '../packages/spark-data/src/types'

// ─── 通用测试 DataSet 工厂 ─────────────────────────────────────

function makeDs(dependencyType: string) {
  return SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [{ name: 'id', type: 'number' }],
        rows: []
      },
      Items: {
        tableName: 'Items',
        columns: [{ name: 'id', type: 'number' }, { name: 'orderId', type: 'number' }],
        rows: []
      }
    },
    relations: [
      {
        parentTable: 'Orders',
        childTable: 'Items',
        dependencyType,
        parentField: 'id',
        childField: 'orderId',
        filterExpression: { field: 'orderId', op: '==', value: null },
        autoLoad: true
      }
    ]
  })
}

// ─── 帮助：手动模拟父视图已加载并有数据 ────────────────────────

function setParentLoaded(pView: ReturnType<typeof SparkData.createDataSet>['tables'][string]['views'][string], rows: IDataRow[]) {
  pView.rows.splice(0, pView.rows.length, ...rows)
  pView.requestState = RequestState.Loaded
}

// ═══════════════════════════════════════════════════════════════
// 测试组 A — 白请求风暴：不相关事件不应触发子请求
// ═══════════════════════════════════════════════════════════════

describe('cascade event filter — no spurious child requests', () => {

  // ── A1: dep=currentRow 子视图不应响应 selectedRows 事件 ──────

  it('dep=currentRow: child should NOT react to parent selectedRows event', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    // 父已加载，currentRow 设为第一行
    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])
    pView.currentRow = pView.rows[0]!

    // 子视图 mock
    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] } as any
    })

    // 父仅发出 selectedRows 事件（用户多选，但子视图 dep=currentRow，与之无关）
    const evt: ViewStateEvent = {
      tableName: 'Orders',
      viewId: 'default',
      changeType: 'selectedRows',
      rows: [pView.rows[0]!, pView.rows[1]!]
    }
    pView.events.emit('stateChanged', evt)
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).not.toHaveBeenCalled()
    cSpy.mockRestore()
  })

  // ── A2: dep=selectedRows 子视图不应响应 currentRow 事件 ─────

  it('dep=selectedRows: child should NOT react to parent currentRow event', async () => {
    const ds = makeDs('selectedRows')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    // 父已加载，selectedRows 设为第一行
    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])
    pView.selectedRows.splice(0, pView.selectedRows.length, pView.rows[0]!)

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] } as any
    })

    // 父仅发出 currentRow 事件（用户点选某行，但子视图 dep=selectedRows，与之无关）
    const evt: ViewStateEvent = {
      tableName: 'Orders',
      viewId: 'default',
      changeType: 'currentRow',
      row: pView.rows[1]!
    }
    pView.events.emit('stateChanged', evt)
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).not.toHaveBeenCalled()
    cSpy.mockRestore()
  })

  // ── A3: dep=allRows 子视图不应响应 currentRow/selectedRows 事件 ──

  it('dep=allRows: child should NOT react to parent currentRow or selectedRows events', async () => {
    const ds = makeDs('allRows')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] } as any
    })

    pView.events.emit('stateChanged', {
      tableName: 'Orders', viewId: 'default', changeType: 'currentRow', row: pView.rows[0]!
    })
    pView.events.emit('stateChanged', {
      tableName: 'Orders', viewId: 'default', changeType: 'selectedRows', rows: [pView.rows[0]!]
    })
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).not.toHaveBeenCalled()
    cSpy.mockRestore()
  })

  // ── A4: 正向验证：dep=currentRow 子视图应响应 currentRow 事件 ─

  it('dep=currentRow: child SHOULD react to parent currentRow event', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 42 }])
    pView.currentRow = pView.rows[0]!

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: any) => {
      expect(params?.orderId).toBe(42)
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] } as any
    })

    pView.events.emit('stateChanged', {
      tableName: 'Orders', viewId: 'default', changeType: 'currentRow', row: pView.currentRow
    })
    await new Promise(r => setTimeout(r, 30))

    expect(cSpy).toHaveBeenCalledOnce()
    cSpy.mockRestore()
  })

  // ── A5: 正向验证：dep=allRows 子视图应响应 rows 事件 ─────────

  it('dep=allRows: child SHOULD react to parent rows event', async () => {
    const ds = makeDs('allRows')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 7 }])

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async () => {
      cView.requestState = RequestState.Loaded
      return { success: true, data: [] } as any
    })

    pView.events.emit('stateChanged', {
      tableName: 'Orders', viewId: 'default', changeType: 'rows', rows: pView.rows
    })
    await new Promise(r => setTimeout(r, 50))

    expect(cSpy).toHaveBeenCalledOnce()
    cSpy.mockRestore()
  })

  // ── A6: dep=currentRow 子视图应响应 rows 事件（父数据重载，currentRow 被清空） ──

  it('dep=currentRow: child SHOULD react to parent rows event (parent reload clears currentRow)', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    // 子已有数据
    cView.rows.splice(0, cView.rows.length, { id: 99, orderId: 1 })
    cView.requestState = RequestState.Loaded

    // 父重新加载（loadFromServer 会清空 currentRow，只发 rows 事件）
    setParentLoaded(pView, [{ id: 1 }])
    // rows 事件 → 子应清空（parentRows 为空，因为 currentRow=null）
    pView.events.emit('stateChanged', {
      tableName: 'Orders', viewId: 'default', changeType: 'rows', rows: pView.rows
    })
    await new Promise(r => setTimeout(r, 30))

    // currentRow=null → getParentRows=[] → 子应 resetState + emit cleared
    expect(cView.rows.length).toBe(0)
    expect(cView.requestState).toBe(RequestState.Idle)
  })
})

// ═══════════════════════════════════════════════════════════════
// 测试组 B — 陈旧数据（cascadeDirty）
// ═══════════════════════════════════════════════════════════════

describe('cascade stale data — cascadeDirty reload after loading', () => {

  // ── B1: 子 Loading 期间父选中行改变，子完成后应用新选中行重新加载 ──

  it('when parent currentRow changes while child is Loading, child should reload after completion', async () => {
    const ds = makeDs('currentRow')
    const pView = ds.getView('Orders', 'default')!
    const cView = ds.getView('Items', 'default')!

    setParentLoaded(pView, [{ id: 1 }, { id: 2 }])
    pView.currentRow = pView.rows[0]! // 初始选中 id=1

    const loadCallParams: unknown[] = []
    let resolveLoad!: () => void

    // 首次加载挂起（模拟长时 HTTP）
    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementationOnce(
      () => new Promise<any>(resolve => {
        resolveLoad = () => {
          cView.rows.splice(0, cView.rows.length, { id: 101, orderId: 1 })
          cView.requestState = RequestState.Loaded
          loadCallParams.push('call-1')
          resolve({ success: true, data: cView.rows })
        }
      })
    ).mockImplementationOnce(async (params?: any) => {
      // 第二次加载（cascadeDirty 触发），此时父 currentRow=id=2
      loadCallParams.push(`call-2:orderId=${params?.orderId}`)
      cView.rows.splice(0, cView.rows.length, { id: 202, orderId: 2 })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows } as any
    })

    // 启动第一次加载（dep=currentRow, currentRow=id=1）
    pView.events.emit('stateChanged', {
      tableName: 'Orders', viewId: 'default', changeType: 'currentRow', row: pView.rows[0]!
    })

    // 等待 respondToParentChange 启动，child 进入 Loading
    await new Promise(r => setTimeout(r, 10))
    // 此时 child 处于 Preparing/Loading，模拟父 currentRow 切换到 id=2
    pView.currentRow = pView.rows[1]!
    pView.events.emit('stateChanged', {
      tableName: 'Orders', viewId: 'default', changeType: 'currentRow', row: pView.rows[1]!
    })

    // 让第一次加载完成
    resolveLoad()
    // 等待事件循环：cascadeDirty 触发第二次加载
    await new Promise(r => setTimeout(r, 50))

    // 验证：加载了两次，且最终数据是 id=2 的
    expect(cSpy).toHaveBeenCalledTimes(2)
    expect(loadCallParams).toContain('call-1')
    expect(loadCallParams.find(p => typeof p === 'string' && (p as string).includes('orderId=2'))).toBeTruthy()
    expect(cView.rows[0]).toMatchObject({ orderId: 2 })

    cSpy.mockRestore()
  })
})
