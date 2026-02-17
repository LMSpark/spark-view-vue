/**
 * DataKey 统一解析器测试
 *
 * 验证 parseDataKey / resolveDataKey / isDataKey / buildDataKey 的正确性
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SparkData, DataSet } from '@spark-view/spark-data'
import {
  parseDataKey,
  resolveDataKey,
  isDataKey,
  buildDataKey,
  getViewKey
} from '@spark-view/spark-data'
import type { DataKeyDescriptor } from '@spark-view/spark-data'

describe('DataKey 统一解析器', () => {
  // ===== parseDataKey =====

  describe('parseDataKey — 新格式（@ 分隔）', () => {
    it('4 段完整格式：scope@tableName@viewId@field', () => {
      const dk = parseDataKey('MyApp@Users@grid@rows')
      expect(dk).toEqual({
        scope: 'MyApp',
        tableName: 'Users',
        viewId: 'grid',
        field: 'rows',
        raw: 'MyApp@Users@grid@rows'
      })
    })

    it('4 段 currentRow', () => {
      const dk = parseDataKey('PageDS@Orders@default@currentRow')
      expect(dk).toEqual({
        scope: 'PageDS',
        tableName: 'Orders',
        viewId: 'default',
        field: 'currentRow',
        raw: 'PageDS@Orders@default@currentRow'
      })
    })

    it('4 段 selectedRows', () => {
      const dk = parseDataKey('DS@Users@main@selectedRows')
      expect(dk).toEqual({
        scope: 'DS',
        tableName: 'Users',
        viewId: 'main',
        field: 'selectedRows',
        raw: 'DS@Users@main@selectedRows'
      })
    })

    it('3 段简写格式：scope@tableName@field → viewId 默认 default', () => {
      const dk = parseDataKey('MyApp@Users@rows')
      expect(dk).toEqual({
        scope: 'MyApp',
        tableName: 'Users',
        viewId: 'default',
        field: 'rows',
        raw: 'MyApp@Users@rows'
      })
    })

    it('3 段 currentRow', () => {
      const dk = parseDataKey('MyApp@Orders@currentRow')
      expect(dk!.field).toBe('currentRow')
      expect(dk!.viewId).toBe('default')
    })

    it('非法字段名返回 null', () => {
      expect(parseDataKey('MyApp@Users@default@invalidField')).toBeNull()
    })

    it('段数不对返回 null', () => {
      expect(parseDataKey('A@B')).toBeNull()
      expect(parseDataKey('A@B@C@D@E')).toBeNull()
    })

    it('空段返回 null', () => {
      expect(parseDataKey('@Users@rows')).toBeNull()
      expect(parseDataKey('DS@@rows')).toBeNull()
    })
  })

  describe('parseDataKey — 旧格式（不再支持）', () => {
    it('dataset.tables.{tableName}.rows 返回 null', () => {
      expect(parseDataKey('dataset.tables.Users.rows')).toBeNull()
    })

    it('dataset.tables.{tableName}.views.{viewId}.rows 返回 null', () => {
      expect(parseDataKey('dataset.tables.Orders.views.grid.rows')).toBeNull()
    })

    it('dataset.tables.{tableName}.currentRow 返回 null', () => {
      expect(parseDataKey('dataset.tables.Users.currentRow')).toBeNull()
    })

    it('dataset.tables.{tableName}.selectedRows 返回 null', () => {
      expect(parseDataKey('dataset.tables.Users.selectedRows')).toBeNull()
    })

    it('dataset.tables.{tableName}.columns 返回 null', () => {
      expect(parseDataKey('dataset.tables.Users.columns')).toBeNull()
    })
  })

  describe('parseDataKey — 非 DataSet 键', () => {
    it('简单 pageData 路径返回 null', () => {
      expect(parseDataKey('users')).toBeNull()
      expect(parseDataKey('settings.siteName')).toBeNull()
      expect(parseDataKey('formData')).toBeNull()
      expect(parseDataKey('currentRowJson')).toBeNull()
    })

    it('空字符串返回 null', () => {
      expect(parseDataKey('')).toBeNull()
    })
  })

  // ===== isDataKey =====

  describe('isDataKey', () => {
    it('新格式返回 true', () => {
      expect(isDataKey('MyApp@Users@rows')).toBe(true)
      expect(isDataKey('DS@Orders@grid@currentRow')).toBe(true)
    })

    it('旧格式不再识别', () => {
      expect(isDataKey('dataset.tables.Users.rows')).toBe(false)
      expect(isDataKey('dataset.tables.Orders.views.grid.rows')).toBe(false)
    })

    it('普通 pageData 路径返回 false', () => {
      expect(isDataKey('users')).toBe(false)
      expect(isDataKey('settings.siteName')).toBe(false)
      expect(isDataKey('')).toBe(false)
    })
  })

  // ===== buildDataKey =====

  describe('buildDataKey', () => {
    it('构建完整 4 段 dataKey', () => {
      expect(buildDataKey('MyApp', 'Users', 'rows', 'grid')).toBe('MyApp@Users@grid@rows')
    })

    it('省略 viewId 默认 default', () => {
      expect(buildDataKey('MyApp', 'Users', 'rows')).toBe('MyApp@Users@default@rows')
    })

    it('构建 currentRow 键', () => {
      expect(buildDataKey('DS', 'Orders', 'currentRow')).toBe('DS@Orders@default@currentRow')
    })

    it('构建的键可以被 parseDataKey 解析回来', () => {
      const key = buildDataKey('TestDS', 'Products', 'selectedRows', 'grid2')
      const dk = parseDataKey(key)
      expect(dk).toEqual({
        scope: 'TestDS',
        tableName: 'Products',
        viewId: 'grid2',
        field: 'selectedRows',
        raw: key
      })
    })
  })

  // ===== getViewKey =====

  describe('getViewKey', () => {
    it('返回 tableName.viewId 格式', () => {
      const dk = parseDataKey('MyApp@Users@grid@rows')!
      expect(getViewKey(dk)).toBe('Users.grid')
    })

    it('默认视图', () => {
      const dk = parseDataKey('MyApp@Users@rows')!
      expect(getViewKey(dk)).toBe('Users.default')
    })
  })

  // ===== resolveDataKey — 集成 DataSet =====

  describe('resolveDataKey — 从 DataSet 解析数据', () => {
    let dataSet: DataSet

    beforeEach(() => {
      dataSet = SparkData.createDataSet({
        dataSetName: 'TestDS',
        tables: {
          Users: {
            tableName: 'Users',
            columns: [
              { name: 'id', type: 'number' },
              { name: 'name', type: 'string' }
            ],
            rows: [
              { id: 1, name: '张三' },
              { id: 2, name: '李四' }
            ]
          },
          Orders: {
            tableName: 'Orders',
            columns: [
              { name: 'id', type: 'number' },
              { name: 'userId', type: 'number' }
            ],
            rows: []
          }
        }
      })
    })

    it('解析 rows', () => {
      const dk = parseDataKey('TestDS@Users@default@rows')!
      const rows = resolveDataKey(dk, dataSet)
      expect(Array.isArray(rows)).toBe(true)
      expect((rows as unknown[]).length).toBe(2)
    })

    it('解析 currentRow（初始为 null）', () => {
      const dk = parseDataKey('TestDS@Users@default@currentRow')!
      const value = resolveDataKey(dk, dataSet)
      expect(value).toBeNull()
    })

    it('解析 currentRow（设置后）', () => {
      const view = dataSet.getView('Users', 'default')!
      view.setCurrentRow({ id: 1, name: '张三' })
      
      const dk = parseDataKey('TestDS@Users@currentRow')!
      const value = resolveDataKey(dk, dataSet)
      expect(value).toEqual({ id: 1, name: '张三' })
    })

    it('解析 selectedRows', () => {
      const view = dataSet.getView('Users', 'default')!
      view.setSelectedRows([{ id: 1, name: '张三' }])
      
      const dk = parseDataKey('TestDS@Users@selectedRows')!
      const value = resolveDataKey(dk, dataSet)
      expect(Array.isArray(value)).toBe(true)
      expect((value as unknown[]).length).toBe(1)
    })

    it('不存在的表返回 undefined', () => {
      const dk = parseDataKey('TestDS@NonExistent@rows')!
      expect(resolveDataKey(dk, dataSet)).toBeUndefined()
    })

    it('命名视图自动创建', () => {
      const dk = parseDataKey('TestDS@Users@grid@rows')!
      const result = resolveDataKey(dk, dataSet)
      // getOrCreateView 会创建空视图
      expect(Array.isArray(result)).toBe(true)
      expect((result as unknown[]).length).toBe(0)
    })

    it('旧格式不再支持，使用新格式解析', () => {
      // 旧格式已废弃，使用 @ 格式
      const dk = parseDataKey('TestDS@Users@default@rows')!
      const rows = resolveDataKey(dk, dataSet)
      expect(Array.isArray(rows)).toBe(true)
      expect((rows as unknown[]).length).toBe(2)
    })
  })
})
