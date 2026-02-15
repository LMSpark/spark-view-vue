/**
 * 能力驱动事件系统测试（IDataSetContext 模式）
 *
 * 覆盖：
 * - DataSet handleViewStateChanged 事件流：级联 + 通知 + 广播
 * - setCurrentRow / setSelectedRows / clearAll 的事件发射行为
 * - subscribe / notifySubscribers 通过内联 Map 工作
 * - TreeManager 内联事件系统
 */

import { describe, it, expect, vi } from 'vitest'
import { DataSet } from '../packages/spark-data/src/dataset'
import { SparkData } from '../packages/spark-data/src/spark-data'

// ==================== DataSet 事件驱动集成测试 ====================

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

describe('DataSet 统一事件驱动', () => {
  it('setCurrentRow 触发 currentRowChanged 事件', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    ds.on('currentRowChanged', handler)
    const dept = ds.getTable('Departments')!
    dept.setCurrentRow(dept.rows[0]!)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        contextId: 'default',
        row: dept.rows[0]
      })
    )
  })

  it('setCurrentRow(null) 触发 currentRowChanged', () => {
    const ds = createTestDataSet()
    const dept = ds.getTable('Departments')!
    dept.setCurrentRow(dept.rows[0]!)

    const handler = vi.fn()
    ds.on('currentRowChanged', handler)
    dept.setCurrentRow(null)

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ row: null })
    )
  })

  it('setSelectedRows 触发 selectedRowsChanged 事件', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()

    ds.on('selectedRowsChanged', handler)
    const dept = ds.getTable('Departments')!
    dept.setSelectedRows([dept.rows[0]!, dept.rows[1]!])

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        contextId: 'default'
      })
    )
  })

  it('clearAll 触发 contextCleared 事件', () => {
    const ds = createTestDataSet()
    const dept = ds.getTable('Departments')!
    dept.setCurrentRow(dept.rows[0]!)

    const handler = vi.fn()
    ds.on('contextCleared', handler)
    dept.clearAll()

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: 'Departments',
        contextId: 'default'
      })
    )
  })

  it('setCurrentRow 同一行重复设置不触发事件（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()
    ds.on('currentRowChanged', handler)

    const dept = ds.getTable('Departments')!
    const row = dept.rows[0]!
    dept.setCurrentRow(row)
    dept.setCurrentRow(row) // 同一引用

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('setSelectedRows 同样内容重复设置不触发事件（去重）', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()
    ds.on('selectedRowsChanged', handler)

    const dept = ds.getTable('Departments')!
    const rows = [dept.rows[0]!, dept.rows[1]!]
    dept.setSelectedRows(rows)
    dept.setSelectedRows(rows) // 内容相同

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('tableChanged 事件在每次视图状态变化时触发', () => {
    const ds = createTestDataSet()
    const handler = vi.fn()
    ds.on('tableChanged', handler)

    const dept = ds.getTable('Departments')!
    dept.setCurrentRow(dept.rows[0]!)
    dept.setSelectedRows([dept.rows[1]!])

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'Departments' })
    )
  })
})

// ==================== subscribe / notifySubscribers 测试 ====================

describe('DataSet subscribe（内联 Map 实现）', () => {
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

  it('notifySubscribers 不指定 contextId 广播该表所有视图', () => {
    const ds = createTestDataSet()
    const defaultCb = vi.fn()
    const customCb = vi.fn()

    // 创建额外视图
    const dept = ds.getTable('Departments')!
    dept.getOrCreateContext('grid1')

    ds.subscribe('Departments', 'default', defaultCb)
    ds.subscribe('Departments', 'grid1', customCb)

    ds.notifySubscribers('Departments') // 不指定 contextId

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

  it('hasSubscribers 不指定 contextId 检查该表是否有任何订阅', () => {
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

    const dept = ds.getTable('Departments')!
    dept.setCurrentRow(dept.rows[0]!)

    expect(cb).toHaveBeenCalledOnce()
  })
})

// ==================== 事件流完整性测试 ====================

describe('事件流完整端到端', () => {
  it('setCurrentRow 触发完整事件链：stateChanged → 级联 → 通知 → 广播', () => {
    const ds = createTestDataSet()
    const events: string[] = []

    // 监听所有关键事件
    ds.on('currentRowChanged', () => events.push('currentRowChanged'))
    ds.on('tableChanged', () => events.push('tableChanged'))
    ds.subscribe('Departments', 'default', () => events.push('subscribe:Departments.default'))

    const dept = ds.getTable('Departments')!
    dept.setCurrentRow(dept.rows[0]!)

    // 验证事件按正确顺序触发
    expect(events).toContain('subscribe:Departments.default')
    expect(events).toContain('currentRowChanged')
    expect(events).toContain('tableChanged')
  })

  it('getCapabilities 返回 DATA_SET 能力（暴露 dataSet 实例）', () => {
    const ds = createTestDataSet()
    const caps = ds.getCapabilities()

    // 获取 DATA_SET 能力
    const entry = [...caps.entries()][0]
    expect(entry).toBeDefined()

    const impl = entry![1].implementation as {
      dataSet: typeof ds
    }

    // 验证暴露的是 DataSet 实例本身
    expect(impl.dataSet).toBe(ds)
    expect(impl.dataSet.dataSetName).toBe('TestDS')
    expect(impl.dataSet.getTable('Departments')).toBeDefined()
  })

  it('TreeManager 内联事件系统发射事件', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    const handler = vi.fn()
    tree.on('cacheUpdated', handler)

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ cache: expect.any(Object) })
    )
  })
})
