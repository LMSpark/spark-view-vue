/**
 * SparkData 命名空间 API 测试
 */

import { describe, it, expect } from 'vitest'
import { SparkData } from '../packages/spark-data/src/spark-data-namespace'

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
          rows: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ]
        }
      }
    })

    expect(dataSet).toBeDefined()
    expect(dataSet.dataSetName).toBe('TestData')
    expect(dataSet.getTable('Users')).toBeDefined()
    expect(dataSet.getTable('Users')?.rows).toHaveLength(2)
  })

  it('应该提供 createTreeManager 工厂方法', () => {
    const treeManager = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId',
      lazy: false
    }, [
      { id: 1, parentId: null, name: 'Root' },
      { id: 2, parentId: 1, name: 'Child 1' },
      { id: 3, parentId: 1, name: 'Child 2' }
    ])

    expect(treeManager).toBeDefined()
    expect(treeManager.getRoots()).toHaveLength(1)
    expect(treeManager.getChildren(1)).toHaveLength(2)
  })

  it('应该提供 createContext 工厂方法', () => {
    const context = SparkData.createContext('Users', 'default')

    expect(context).toBeDefined()
    expect(context['hostTable']).toBe('Users')
    expect(context['contextId']).toBe('default')
  })

  it('应该提供 fromJSON 工厂方法', () => {
    const json = JSON.stringify({
      dataSetName: 'TestData',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [{ name: 'id', type: 'number' }],
          rows: [{ id: 1 }]
        }
      }
    })

    const dataSet = SparkData.fromJSON(json)

    expect(dataSet).toBeDefined()
    expect(dataSet.dataSetName).toBe('TestData')
  })

  it('应该提供 classes 访问高级用户', () => {
    expect(SparkData.classes).toBeDefined()
    expect(SparkData.classes.DataSet).toBeDefined()
    expect(SparkData.classes.TreeManager).toBeDefined()
    expect(SparkData.classes.DataView).toBeDefined()
  })

  it('命名空间 API 应该与直接导入保持一致', () => {
    const dataSet1 = SparkData.createDataSet({
      dataSetName: 'Test1',
      tables: {}
    })

    const { DataSet } = SparkData.classes
    const dataSet2 = new DataSet({
      dataSetName: 'Test2',
      tables: {}
    })

    expect(dataSet1.constructor).toBe(dataSet2.constructor)
  })
})
