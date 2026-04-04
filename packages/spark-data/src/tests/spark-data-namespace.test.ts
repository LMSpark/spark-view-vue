/**
 * SparkData 命名空间 API 测试
 */

import { describe, it, expect } from 'vitest'
import { SparkData } from '@spark-view/spark-data'

describe('SparkData Namespace', () => {
  it('应该提供 createDataSet 工厂方法', () => {
    const dataSet = SparkData.createDataSet({
      dataSetName: 'TestData',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' }
          ],
          views: {
            default: {
              rows: [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' }
              ]
            }
          }
        }
      }
    })

    expect(dataSet).toBeDefined()
    expect(dataSet.dataSetName).toBe('TestData')
    expect(dataSet.getTable('Users')).toBeDefined()
    expect(dataSet.getTable('Users')?.views['default']?.rows).toHaveLength(2)
  })

  it('应该提供 createTreeManager 工厂方法', () => {
    const treeManager = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    }, [
      { id: 1, parentId: null, name: 'Root' },
      { id: 2, parentId: 1, name: 'Child 1' },
      { id: 3, parentId: 1, name: 'Child 2' }
    ])

    expect(treeManager).toBeDefined()
    expect(treeManager.getRoots()).toHaveLength(1)
    expect(treeManager.getChildren(1)).toHaveLength(2)
  })

  it('应该提供 createDataView 工厂方法', () => {
    const view = SparkData.createDataView({ tableName: 'Users', viewId: 'default' })

    expect(view).toBeDefined()
    expect(view['tableName']).toBe('Users')
    expect(view['viewId']).toBe('default')
  })

  it('应该提供 fromJSON 工厂方法', () => {
    const json = JSON.stringify({
      dataSetName: 'TestData',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          views: { default: { rows: [{ id: 1 }] } }
        }
      }
    })

    const dataSet = SparkData.fromJSON(json)

    expect(dataSet).toBeDefined()
    expect(dataSet.dataSetName).toBe('TestData')
  })

  it('命名空间 API 创建的实例应该是正确的类型', () => {
    const dataSet1 = SparkData.createDataSet({
      dataSetName: 'Test1',
      tables: {}
    })

    const dataSet2 = SparkData.createDataSet({
      dataSetName: 'Test2',
      tables: {}
    })

    // 同一工厂方法创建的实例是相同类型
    expect(dataSet1.constructor).toBe(dataSet2.constructor)
  })
})
