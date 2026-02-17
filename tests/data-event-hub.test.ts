/**
 * 能力体系通信测试（DataView 事件 + subscribe 模式）
 *
 * 覆盖：
 * - DataView.events.on('stateChanged') 状态监听
 * - DataView.setCurrentRow / setSelectedRows / clearAll 触发状态变更
 * - subscribe / notifySubscribers 数据订阅
 * - TreeManager 缓存操作（无事件）
 *
 * 【设计原则】DataView 是与 UI 交互的唯一通道。
 * 所有 UI 状态操作（setCurrentRow, setSelectedRows, clearAll）
 * 必须通过 DataView，不通过 DataTable。
 * 状态监听直接订阅 DataView.events，不经过 DataSet。
 */

import { describe, it, expect, vi } from 'vitest'
import type { ViewStateEvent } from '../packages/spark-data/src/types'
import { SparkData } from '../packages/spark-data/src/spark-data'
import { DATA_SET } from '@spark-view/spark-utils'

// ==================== 工具函数 ====================

function createTestDataSet() {
  return SparkData.createDataSet({
    dataSetName: 'TestDS',
    tables: {
      Departments: {
        tableName: 'Departments',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'name', type: 'string' }
        ],
        rows: [
          { id: 1, name: 'Engineering' },
          { id: 2, name: 'Marketing' }
        ]
      },
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'deptId', type: 'number' },
          { name: 'name', type: 'string' }
        ],
        rows: [
          { id: 101, deptId: 1, name: 'Alice' },
          { id: 102, deptId: 1, name: 'Bob' }
        ]
      }
    },
    relations: [
      {
        parentTable: 'Departments',
        childTable: 'Users',
        dependencyType: 'currentRow' as const,
        filterExpression: { field: 'deptId', op: '==' as const, value: null }
      }
    ]
  })
}

// ==================== DataView.events stateChanged 测试 ====================

describe('DataView.events.on stateChanged（视图状态监听）', () => {
  it('setCurrentRow 触发 currentRow 状态变更', () => {
    const ds = createTestDataSet()
    const handler = vi.fn<[ViewStateEvent], void>()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', (...args: unknown[]) => handler(args[0] as ViewStateEvent))
    deptView.setCurrentRow(deptView.rows[0]!)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        viewId: 'default',
        changeType: 'currentRow',
        row: deptView.rows[0]
      })
    )
  })

  it('setCurrentRow(null) 触发 currentRow 状态变更', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn<[ViewStateEvent], void>()
    deptView.events.on('stateChanged', (...args: unknown[]) => handler(args[0] as ViewStateEvent))
    deptView.setCurrentRow(null)

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ changeType: 'currentRow', row: null })
    )
  })

  it('setSelectedRows 触发 selectedRows 状态变更', () => {
    const ds = createTestDataSet()
    const handler = vi.fn<[ViewStateEvent], void>()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', (...args: unknown[]) => handler(args[0] as ViewStateEvent))
    deptView.setSelectedRows([deptView.rows[0]!, deptView.rows[1]!])

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        viewId: 'default',
        changeType: 'selectedRows'
      })
    )
  })

  it('clearAll 触发 cleared 状态变更', () => {
    const ds = createTestDataSet()
    const deptView = ds.getView('Departments')!
    deptView.setCurrentRow(deptView.rows[0]!)

    const handler = vi.fn<[ViewStateEvent], void>()
    deptView.events.on('stateChanged', (...args: unknown[]) => handler(args[0] as ViewStateEvent))
    deptView.clearAll()

    expect(handler).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        viewId: 'default',
        changeType: 'cleared'
      })
    )
  })

  it('setCurrentRow 同一行重复设置不触发状态变更（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    const row = deptView.rows[0]!
    deptView.setCurrentRow(row)
    deptView.setCurrentRow(row) // 同一引用

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('setSelectedRows 同样内容重复设置不触发状态变更（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    const rows = [deptView.rows[0]!, deptView.rows[1]!]
    deptView.setSelectedRows(rows)
    const countAfterFirst = handler.mock.calls.length
    deptView.setSelectedRows(rows) // 内容相同

    // 第二次调用应被去重，不增加调用次数
    expect(handler.mock.calls.length).toBe(countAfterFirst)
  })

  it('每次视图状态变化都触发 stateChanged', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    deptView.setCurrentRow(deptView.rows[0]!)
    deptView.setSelectedRows([deptView.rows[1]!])

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('events.off 取消监听', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    const deptView = ds.getView('Departments')!
    deptView.events.on('stateChanged', handler)

    deptView.setCurrentRow(deptView.rows[0]!)
    expect(handler).toHaveBeenCalledOnce()

    deptView.events.off('stateChanged', handler)
    deptView.setCurrentRow(deptView.rows[1]!)
    expect(handler).toHaveBeenCalledOnce() // 不再增加
  })
})

// ==================== subscribe / notifySubscribers 测试 ====================

describe('DataSet subscribe（数据订阅）', () => {
  it('subscribe 返回取消订阅函数', () => {
    const ds = createTestDataSet()
    const cb = vi.fn()

    const unsub = ds.subscribe('Departments', 'default', cb)
    ds.notifySubscribers('Departments', 'default')
    expect(cb).toHaveBeenCalledOnce()

    unsub()
    ds.notifySubscribers('Departments', 'default')
    expect(cb).toHaveBeenCalledOnce() // 不再增加
  })

  it('notifySubscribers 不指定 viewId 广播该表所有视图', () => {
    const ds = createTestDataSet()
    const defaultCb = vi.fn()
    const customCb = vi.fn()

    // 创建额外视图
    const dept = ds.getTable('Departments')!
    dept.getOrCreateView('grid1')

    ds.subscribe('Departments', 'default', defaultCb)
    ds.subscribe('Departments', 'grid1', customCb)

    ds.notifySubscribers('Departments') // 不指定 viewId

    expect(defaultCb).toHaveBeenCalledOnce()
    expect(customCb).toHaveBeenCalledOnce()
  })

  it('hasSubscribers 精确查询', () => {
    const ds = createTestDataSet()
    expect(ds.hasSubscribers('Departments', 'default')).toBe(false)

    const unsub = ds.subscribe('Departments', 'default', vi.fn())
    expect(ds.hasSubscribers('Departments', 'default')).toBe(true)
    expect(ds.hasSubscribers('Departments', 'other')).toBe(false)

    unsub()
    expect(ds.hasSubscribers('Departments', 'default')).toBe(false)
  })

  it('hasSubscribers 不指定 viewId 检查该表是否有任何订阅', () => {
    const ds = createTestDataSet()
    expect(ds.hasSubscribers('Departments')).toBe(false)

    const unsub = ds.subscribe('Departments', 'grid1', vi.fn())
    expect(ds.hasSubscribers('Departments')).toBe(true)

    unsub()
    expect(ds.hasSubscribers('Departments')).toBe(false)
  })

  it('setCurrentRow 自动触发 subscribe 回调', () => {
    const ds = createTestDataSet()
    const cb = vi.fn()
    ds.subscribe('Departments', 'default', cb)

    const deptView = ds.getView('Departments')!
    deptView.setCurrentRow(deptView.rows[0]!)

    expect(cb).toHaveBeenCalledOnce()
  })
})

// ==================== 能力流端到端测试 ====================

describe('能力流端到端', () => {
  it('setCurrentRow 触发完整能力流：级联 → 通知 → 状态事件', () => {
    const ds = createTestDataSet()
    const events: string[] = []

    const deptView = ds.getView('Departments')!

    // 直接订阅视图的 stateChanged 事件（DataView 是状态变更的归属者）
    deptView.events.on('stateChanged', (...args: unknown[]) => {
      const event = args[0] as ViewStateEvent
      events.push(`stateChange:${event.changeType}`)
    })
    ds.subscribe('Departments', 'default', () => events.push('subscribe:Departments.default'))

    deptView.setCurrentRow(deptView.rows[0]!)

    // 验证能力流：subscribe 和 stateChange 都被触发
    expect(events).toContain('subscribe:Departments.default')
    expect(events).toContain('stateChange:currentRow')
  })

  it('getCapabilities 返回 DATA_SET 能力（暴露 dataSet 实例）', () => {
    const ds = createTestDataSet()
    const caps = ds.capabilities

    // 获取 DATA_SET 能力
    const impl = caps.get(DATA_SET) as {
      dataSet: typeof ds
    }

    // 验证暴露的是 DataSet 实例本身
    expect(impl.dataSet).toBe(ds)
    expect(impl.dataSet.dataSetName).toBe('TestDS')
    expect(impl.dataSet.getTable('Departments')).toBeDefined()
  })
})

// ==================== TreeManager 缓存测试（无事件） ====================

describe('TreeManager 缓存操作', () => {
  it('addNodesToCache 正确写入缓存', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])

    const cache = tree.getCache()
    expect(cache[1]).toBeDefined()
    expect(cache[1]!.name).toBe('Root')
  })

  it('clear 清空缓存', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])
    tree.clear()

    const cache = tree.getCache()
    expect(Object.keys(cache)).toHaveLength(0)
  })
})
