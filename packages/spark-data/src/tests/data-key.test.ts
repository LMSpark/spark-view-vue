/**
 * DataKey 统一解析器测试
 *
 * 验证 parseDataKey / resolveDataKey / isDataKey / buildDataKey 的正确性
 *
 * 格式：
 *   - 2 段：tableName@field（viewId 默认 'default'）
 *   - 3 段：tableName@viewId@field
 *   - 跨页面：#scope@tableName@field 或 #scope@tableName@viewId@field
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SparkData, DataSet } from '@spark-view/spark-data'
import {
  parseDataKey,
  resolveDataKey,
  isDataKey,
} from '@spark-view/spark-data'
import { buildDataKey, getViewKey } from '../core/data-key'

describe('DataKey 统一解析器', () => {
  // ===== parseDataKey — 2 段简写 =====

  describe('parseDataKey — 2 段简写（table@field）', () => {
    it('table@rows', () => {
      const dk = parseDataKey('Users@rows')
      expect(dk).toEqual({
        tableName: 'Users',
        viewId: 'default',
        field: 'rows',
        raw: 'Users@rows'
      })
    })

    it('table@currentRow', () => {
      const dk = parseDataKey('Orders@currentRow')
      expect(dk).toEqual({
        tableName: 'Orders',
        viewId: 'default',
        field: 'currentRow',
        raw: 'Orders@currentRow'
      })
    })

    it('table@selectedRows', () => {
      const dk = parseDataKey('Users@selectedRows')
      expect(dk).toEqual({
        tableName: 'Users',
        viewId: 'default',
        field: 'selectedRows',
        raw: 'Users@selectedRows'
      })
    })

    it('table@summaryRow', () => {
      const dk = parseDataKey('Orders@summaryRow')
      expect(dk!.field).toBe('summaryRow')
      expect(dk!.viewId).toBe('default')
    })

    it('table@selectionSummaryRow', () => {
      const dk = parseDataKey('Items@selectionSummaryRow')
      expect(dk!.field).toBe('selectionSummaryRow')
    })

    it('带字段路径 table@field.path', () => {
      const dk = parseDataKey('stats@currentRow.totalUsers')
      expect(dk).toEqual({
        tableName: 'stats',
        viewId: 'default',
        field: 'currentRow',
        fieldPath: 'totalUsers',
        raw: 'stats@currentRow.totalUsers'
      })
    })

    it('非法字段名返回 null', () => {
      expect(parseDataKey('Users@invalidField')).toBeNull()
    })
  })

  // ===== parseDataKey — 3 段完整 =====

  describe('parseDataKey — 3 段完整（table@viewId@field）', () => {
    it('table@viewId@rows', () => {
      const dk = parseDataKey('Users@grid@rows')
      expect(dk).toEqual({
        tableName: 'Users',
        viewId: 'grid',
        field: 'rows',
        raw: 'Users@grid@rows'
      })
    })

    it('table@default@currentRow', () => {
      const dk = parseDataKey('Orders@default@currentRow')
      expect(dk).toEqual({
        tableName: 'Orders',
        viewId: 'default',
        field: 'currentRow',
        raw: 'Orders@default@currentRow'
      })
    })

    it('带字段路径 table@viewId@field.path', () => {
      const dk = parseDataKey('stats@default@currentRow.totalUsers')
      expect(dk).toEqual({
        tableName: 'stats',
        viewId: 'default',
        field: 'currentRow',
        fieldPath: 'totalUsers',
        raw: 'stats@default@currentRow.totalUsers'
      })
    })

    it('非法字段名返回 null', () => {
      expect(parseDataKey('Users@grid@invalidField')).toBeNull()
    })
  })

  // ===== parseDataKey — 跨页面 #scope =====

  describe('parseDataKey — 跨页面 #scope 前缀', () => {
    it('#scope@table@field（3 段，viewId 默认 default）', () => {
      const dk = parseDataKey('#SharedDS@Orders@rows')
      expect(dk).toEqual({
        scope: 'SharedDS',
        tableName: 'Orders',
        viewId: 'default',
        field: 'rows',
        raw: '#SharedDS@Orders@rows',
        crossPage: true
      })
    })

    it('#scope@table@viewId@field（4 段完整）', () => {
      const dk = parseDataKey('#SharedDS@Orders@grid@rows')
      expect(dk).toEqual({
        scope: 'SharedDS',
        tableName: 'Orders',
        viewId: 'grid',
        field: 'rows',
        raw: '#SharedDS@Orders@grid@rows',
        crossPage: true
      })
    })

    it('#scope@table@field.path 带字段路径', () => {
      const dk = parseDataKey('#SharedDS@stats@currentRow.revenue')
      expect(dk).toEqual({
        scope: 'SharedDS',
        tableName: 'stats',
        viewId: 'default',
        field: 'currentRow',
        fieldPath: 'revenue',
        raw: '#SharedDS@stats@currentRow.revenue',
        crossPage: true
      })
    })

    it('#scope@table@viewId@field.path 带字段路径', () => {
      const dk = parseDataKey('#SharedDS@stats@main@currentRow.revenue')
      expect(dk).toEqual({
        scope: 'SharedDS',
        tableName: 'stats',
        viewId: 'main',
        field: 'currentRow',
        fieldPath: 'revenue',
        raw: '#SharedDS@stats@main@currentRow.revenue',
        crossPage: true
      })
    })

    it('#scope 非法字段名返回 null', () => {
      expect(parseDataKey('#DS@Users@invalidField')).toBeNull()
    })

    it('#scope 段数不足返回 null', () => {
      expect(parseDataKey('#DS@Users')).toBeNull()
    })

    it('#scope 空段返回 null', () => {
      expect(parseDataKey('#@Users@rows')).toBeNull()
      expect(parseDataKey('#DS@Users@')).toBeNull()
    })
  })

  // ===== parseDataKey — 旧点号格式 =====

  describe('parseDataKey — 旧点号格式（不再支持）', () => {
    it('dataset.tables.{tableName}.rows 返回 null', () => {
      expect(parseDataKey('dataset.tables.Users.rows')).toBeNull()
    })

    it('dataset.tables.{tableName}.views.{viewId}.rows 返回 null', () => {
      expect(parseDataKey('dataset.tables.Orders.views.grid.rows')).toBeNull()
    })

    it('dataset.tables.{tableName}.currentRow 返回 null', () => {
      expect(parseDataKey('dataset.tables.Users.currentRow')).toBeNull()
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
    it('2 段新格式返回 true', () => {
      expect(isDataKey('Users@rows')).toBe(true)
    })

    it('3 段新格式返回 true', () => {
      expect(isDataKey('Users@grid@rows')).toBe(true)
    })

    it('4 段格式 isDataKey 仍返回 true（仅检测 @ 存在）', () => {
      expect(isDataKey('DS@Orders@grid@currentRow')).toBe(true)
    })

    it('#scope 跨页面格式返回 true', () => {
      expect(isDataKey('#SharedDS@Orders@rows')).toBe(true)
    })

    it('旧点号格式不再识别', () => {
      expect(isDataKey('dataset.tables.Users.rows')).toBe(false)
    })

    it('普通 pageData 路径返回 false', () => {
      expect(isDataKey('users')).toBe(false)
      expect(isDataKey('settings.siteName')).toBe(false)
      expect(isDataKey('')).toBe(false)
    })
  })

  // ===== buildDataKey =====

  describe('buildDataKey', () => {
    it('2 段简写（省略 viewId）', () => {
      expect(buildDataKey('Users', 'rows')).toBe('Users@rows')
    })

    it('3 段完整（指定 viewId）', () => {
      expect(buildDataKey('Users', 'rows', 'grid')).toBe('Users@grid@rows')
    })

    it('viewId=default 时输出 2 段', () => {
      expect(buildDataKey('Orders', 'currentRow', 'default')).toBe('Orders@currentRow')
    })

    it('#scope 跨页面 2 段', () => {
      expect(buildDataKey('Orders', 'rows', 'default', 'SharedDS')).toBe('#SharedDS@Orders@rows')
    })

    it('#scope 跨页面 3 段', () => {
      expect(buildDataKey('Orders', 'rows', 'grid', 'SharedDS')).toBe('#SharedDS@Orders@grid@rows')
    })

    it('构建的键可以被 parseDataKey 解析回来', () => {
      const key = buildDataKey('Products', 'selectedRows', 'grid2')
      const dk = parseDataKey(key)
      expect(dk).toEqual({
        tableName: 'Products',
        viewId: 'grid2',
        field: 'selectedRows',
        raw: key
      })
    })

    it('#scope 构建的键可以被 parseDataKey 解析回来', () => {
      const key = buildDataKey('Products', 'selectedRows', 'grid2', 'SharedDS')
      const dk = parseDataKey(key)
      expect(dk).toEqual({
        scope: 'SharedDS',
        tableName: 'Products',
        viewId: 'grid2',
        field: 'selectedRows',
        raw: key,
        crossPage: true
      })
    })
  })

  // ===== getViewKey =====

  describe('getViewKey', () => {
    it('返回 tableName.viewId 格式', () => {
      const dk = parseDataKey('Users@grid@rows')!
      expect(getViewKey(dk)).toBe('Users.grid')
    })

    it('2 段默认视图', () => {
      const dk = parseDataKey('Users@rows')!
      expect(getViewKey(dk)).toBe('Users.default')
    })

    it('#scope 跨页面键', () => {
      const dk = parseDataKey('#SharedDS@Users@grid@rows')!
      expect(getViewKey(dk)).toBe('Users.grid')
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
            views: {
              default: {
                rows: [
                  { id: 1, name: '张三' },
                  { id: 2, name: '李四' }
                ],
                autoCurrentFirst: false,
                autoSelectFirst: false
              }
            }
          },
          Orders: {
            tableName: 'Orders',
            columns: [
              { name: 'id', type: 'number' },
              { name: 'userId', type: 'number' }
            ],
            views: { default: { rows: [] } }
          }
        }
      })
    })

    it('2 段新格式解析 rows', () => {
      const dk = parseDataKey('Users@rows')!
      const rows = resolveDataKey(dk, dataSet)
      expect(Array.isArray(rows)).toBe(true)
      expect((rows as unknown[]).length).toBe(2)
    })

    it('3 段新格式解析 rows', () => {
      const dk = parseDataKey('Users@default@rows')!
      const rows = resolveDataKey(dk, dataSet)
      expect(Array.isArray(rows)).toBe(true)
      expect((rows as unknown[]).length).toBe(2)
    })

    it('4 段旧格式不再支持，返回 null', () => {
      const dk = parseDataKey('TestDS@Users@default@rows')
      expect(dk).toBeNull()
    })

    it('解析 currentRow（初始为 null）', () => {
      const dk = parseDataKey('Users@currentRow')!
      const value = resolveDataKey(dk, dataSet)
      expect(value).toBeNull()
    })

    it('解析 currentRow（设置后）', () => {
      const view = dataSet.getView('Users', 'default')!
      view.selection.setCurrentRow({ id: 1, name: '张三' })

      const dk = parseDataKey('Users@currentRow')!
      const value = resolveDataKey(dk, dataSet)
      expect(value).toEqual({ id: 1, name: '张三', _pk: 1 })
    })

    it('解析 selectedRows', () => {
      const view = dataSet.getView('Users', 'default')!
      view.selection.setSelectedRows([{ id: 1, name: '张三' }])

      const dk = parseDataKey('Users@selectedRows')!
      const value = resolveDataKey(dk, dataSet)
      expect(Array.isArray(value)).toBe(true)
      expect((value as unknown[]).length).toBe(1)
    })

    it('不存在的表返回 undefined', () => {
      const dk = parseDataKey('NonExistent@rows')!
      expect(resolveDataKey(dk, dataSet)).toBeUndefined()
    })

    it('不存在的视图返回 undefined', () => {
      const dk = parseDataKey('Users@grid@rows')!
      const result = resolveDataKey(dk, dataSet)
      expect(result).toBeUndefined()
    })
  })
})