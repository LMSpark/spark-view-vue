import { describe, it, expect, vi } from 'vitest'
import { SparkData } from '../packages/spark-data/src/spark-data'
import { RequestState } from '../packages/spark-data/src/data-view'
import { createEventContext } from '../packages/spark-data/src/core/event-id'

describe('DataView.requestData orchestration', () => {
  it('should load parents first then child and update requestState', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OrchDS',
      tables: {
        Parents: { tableName: 'Parents', columns: [{ name: 'id', type: 'number' }], rows: [] },
        Children: { tableName: 'Children', columns: [{ name: 'id', type: 'number' }], rows: [] }
      },
      relations: [
        {
          parentTable: 'Parents',
          childTable: 'Children',
          dependencyType: 'allRows',
          filterExpression: { field: 'parentId', op: '==', value: null },
          autoLoad: true
        }
      ]
    })

    const pView = ds.getView('Parents', 'default')!
    const cView = ds.getView('Children', 'default')!

    const pSpy = vi.spyOn(pView, 'loadFromServer').mockImplementation(async () => {
      pView.rows.splice(0, pView.rows.length, { id: 11 })
      pView.requestState = RequestState.Loaded
      return { success: true, data: pView.rows } as any
    })

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: any) => {
      expect(params).toBeDefined()
      expect(params.parentId).toBe(11)
      cView.rows.splice(0, cView.rows.length, { id: 101, parentId: 11 })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows } as any
    })

    expect(pView.requestState).toBe(RequestState.Idle)
    expect(cView.requestState).toBe(RequestState.Idle)

    await cView.requestData()

    expect(pSpy).toHaveBeenCalledOnce()
    expect(cSpy).toHaveBeenCalledOnce()
    expect(pView.requestState).toBe(RequestState.Loaded)
    expect(cView.requestState).toBe(RequestState.Loaded)

    pSpy.mockRestore(); cSpy.mockRestore()
  })

  it('should not load child if parent dependency remains unsatisfied', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OrchDS2',
      tables: {
        Parents: { tableName: 'Parents', columns: [{ name: 'id', type: 'number' }], rows: [] },
        Children: { tableName: 'Children', columns: [{ name: 'id', type: 'number' }], rows: [] }
      },
      relations: [
        { parentTable: 'Parents', childTable: 'Children', dependencyType: 'allRows', filterExpression: { field: 'parentId', op: '==', value: null } }
      ]
    })

    const pView = ds.getView('Parents', 'default')!
    const cView = ds.getView('Children', 'default')!

    // parent load succeeds, but returns no rows
    const pSpy = vi.spyOn(pView, 'loadFromServer').mockImplementation(async () => {
      pView.requestState = RequestState.Loaded
      return { success: true, data: [] } as any
    })
    const cSpy = vi.spyOn(cView, 'loadFromServer')

    await cView.requestData()

    // parent was called but since parentRows empty, child should NOT be called
    expect(pSpy).toHaveBeenCalled()
    expect(cSpy).not.toHaveBeenCalled()
    // child dependency failed → requestState=Failed
    expect(cView.requestState).toBe(RequestState.Failed)

    pSpy.mockRestore(); cSpy.mockRestore()
  })

  it('respects relation parentField/childField mapping when building params', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'OrchDS3',
      tables: {
        Parents: { tableName: 'Parents', columns: [{ name: 'uuid', type: 'string' }], rows: [] },
        Children: { tableName: 'Children', columns: [{ name: 'id', type: 'number' }, { name: 'parentUuid', type: 'string' }], rows: [] }
      },
      relations: [
        {
          parentTable: 'Parents', childTable: 'Children', dependencyType: 'currentRow',
          parentField: 'uuid', childField: 'parentUuid',
          filterExpression: { field: 'parentUuid', op: '==', value: null },
          autoLoad: true
        }
      ]
    })

    const pView = ds.getView('Parents', 'default')!
    const cView = ds.getView('Children', 'default')!

    const pSpy = vi.spyOn(pView, 'loadFromServer').mockImplementation(async () => {
      pView.rows.splice(0, pView.rows.length, { uuid: 'p-1' })
      // 直接赋值 currentRow，避免 setCurrentRow 触发 stateChanged 干扰编排
      pView.currentRow = pView.rows[0]!
      pView.requestState = RequestState.Loaded
      return { success: true, data: pView.rows } as any
    })

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: any) => {
      expect(params).toBeDefined()
      expect(params.parentUuid).toBe('p-1')
      cView.rows.splice(0, cView.rows.length, { id: 101, parentUuid: 'p-1' })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows } as any
    })

    await cView.requestData()

    expect(pSpy).toHaveBeenCalled()
    expect(cSpy).toHaveBeenCalled()

    pSpy.mockRestore(); cSpy.mockRestore()
  })

  it('step 4.4: triggers children BR after successful load (3-level cascade)', async () => {
    // 三层级联：A → B → C
    // 调用 A.requestData()
    // A 加载成功后 step 4.4 触发 B 的 C，B 成功后 step 4.4 触发 C 的 C
    const ds = SparkData.createDataSet({
      dataSetName: 'ThreeLevel',
      tables: {
        A: { tableName: 'A', columns: [{ name: 'id', type: 'number' }], rows: [] },
        B: { tableName: 'B', columns: [{ name: 'id', type: 'number' }, { name: 'aId', type: 'number' }], rows: [] },
        C: { tableName: 'C', columns: [{ name: 'id', type: 'number' }, { name: 'bId', type: 'number' }], rows: [] }
      },
      relations: [
        {
          parentTable: 'A', childTable: 'B', dependencyType: 'allRows',
          filterExpression: { field: 'aId', op: '==', value: null },
          autoLoad: true
        },
        {
          parentTable: 'B', childTable: 'C', dependencyType: 'allRows',
          filterExpression: { field: 'bId', op: '==', value: null },
          autoLoad: true
        }
      ]
    })

    const aView = ds.getView('A', 'default')!
    const bView = ds.getView('B', 'default')!
    const cView = ds.getView('C', 'default')!

    const aSpy = vi.spyOn(aView, 'loadFromServer').mockImplementation(async () => {
      aView.rows.splice(0, aView.rows.length, { id: 1 })
      aView.requestState = RequestState.Loaded
      aView.events.emit('stateChanged', { 
        tableName: 'A', 
        viewId: 'default', 
        changeType: 'rows', 
        rows: aView.rows,
        context: createEventContext('program', { tableName: 'A', viewId: 'default' })
      })
      return { success: true, data: aView.rows } as any
    })

    const bSpy = vi.spyOn(bView, 'loadFromServer').mockImplementation(async (params?: any) => {
      expect(params).toBeDefined()
      expect(params.aId).toBe(1)
      bView.rows.splice(0, bView.rows.length, { id: 10, aId: 1 })
      bView.requestState = RequestState.Loaded
      bView.events.emit('stateChanged', { 
        tableName: 'B', 
        viewId: 'default', 
        changeType: 'rows', 
        rows: bView.rows,
        context: createEventContext('program', { tableName: 'B', viewId: 'default' })
      })
      return { success: true, data: bView.rows } as any
    })

    const cSpy = vi.spyOn(cView, 'loadFromServer').mockImplementation(async (params?: any) => {
      expect(params).toBeDefined()
      expect(params.bId).toBe(10)
      cView.rows.splice(0, cView.rows.length, { id: 100, bId: 10 })
      cView.requestState = RequestState.Loaded
      return { success: true, data: cView.rows } as any
    })

    // 只调用 A 的 C — 期望 B 和 C 被 step 4.4 自动级联触发
    await aView.requestData()

    // A 立即完成
    expect(aSpy).toHaveBeenCalledOnce()
    expect(aView.requestState).toBe(RequestState.Loaded)

    // B 和 C 是 fire-and-forget，等待微任务队列冲刷
    await new Promise(r => setTimeout(r, 50))

    expect(bSpy).toHaveBeenCalledOnce()
    expect(bView.requestState).toBe(RequestState.Loaded)
    expect(cSpy).toHaveBeenCalledOnce()
    expect(cView.requestState).toBe(RequestState.Loaded)

    aSpy.mockRestore(); bSpy.mockRestore(); cSpy.mockRestore()
  })

  it('step 4.1: sets requestState to Preparing before calling loadFromServer', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'StateDS',
      tables: {
        T: { tableName: 'T', columns: [{ name: 'id', type: 'number' }], rows: [] }
      }
    })

    const view = ds.getView('T', 'default')!
    let capturedState: RequestState | undefined

    vi.spyOn(view, 'loadFromServer').mockImplementation(async () => {
      // requestData 在调 loadFromServer 之前处于 Preparing 阶段
      capturedState = view.requestState
      view.requestState = RequestState.Loaded
      return { success: true } as any
    })

    await view.requestData()

    // 进入 loadFromServer 时 requestData 编排阶段尚未结束 → Preparing
    expect(capturedState).toBe(RequestState.Preparing)
    expect(view.requestState).toBe(RequestState.Loaded)
  })

  it('idempotent: returns immediately if requestState !== 0', async () => {
    const ds = SparkData.createDataSet({
      dataSetName: 'IdempotentDS',
      tables: {
        T: { tableName: 'T', columns: [{ name: 'id', type: 'number' }], rows: [] }
      }
    })

    const view = ds.getView('T', 'default')!
    const spy = vi.spyOn(view, 'loadFromServer')

    // 设置 requestState=Loaded（已完成）
    view.requestState = RequestState.Loaded
    await view.requestData()
    expect(spy).not.toHaveBeenCalled()

    // 设置 requestState=Preparing（准备中）
    view.requestState = RequestState.Preparing
    await view.requestData()
    expect(spy).not.toHaveBeenCalled()

    spy.mockRestore()
  })
})
