/**
 * TreeManager 本地缓存测试
 */

import { describe, it, expect } from 'vitest'
import { SparkData } from '@spark-appworks/spark-data'

describe('TreeManager 缓存操作', () => {
  it('addNodesToCache 正确写入缓存', () => {
    const tree = SparkData.createTreeManager({
      idField: 'id',
      parentIdField: 'parentId'
    })

    tree.addNodesToCache([
      { id: 1, parentId: null, name: 'Root' }
    ])

    expect(tree.getNode(1)).toBeDefined()
    expect(tree.getNode(1)!['name']).toBe('Root')
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

    expect(tree.getNode(1)).toBeUndefined()
    expect(tree.getRoots()).toHaveLength(0)
  })
})