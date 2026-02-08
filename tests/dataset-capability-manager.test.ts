/**
 * DataSetCapabilityManager 测试
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, beforeEach } from 'vitest'
import { createDataSetCapabilityManager } from '../packages/spark-data/src/capability/DataSetCapabilityManager'
import { SparkData } from '../packages/spark-data/src/spark-data-namespace'
import { DATA_SET_STATE, GLOBAL_DATA, PAGE_SERVICE, API_CLIENT } from '../packages/spark-utils/src/capability-symbols'

describe('DataSetCapabilityManager', () => {
  let manager: ReturnType<typeof createDataSetCapabilityManager>
  let mockDataSet: ReturnType<typeof SparkData.createDataSet>

  beforeEach(() => {
    // 创建模拟 DataSet
    mockDataSet = SparkData.createDataSet({
      dataSetName: 'TestData',
      tables: {
        Users: {
          tableName: 'Users',
          columns: [
            { name: 'id', type: 'string', isPrimaryKey: true },
            { name: 'name', type: 'string' },
            { name: 'age', type: 'number' }
          ],
          rows: [
            { id: '1', name: 'Alice', age: 30 },
            { id: '2', name: 'Bob', age: 25 }
          ]
        }
      }
    })

    // 创建管理器
    manager = createDataSetCapabilityManager('test-page', {
      dataSet: mockDataSet,
      pageParams: { id: '123' },
      pagePermission: { canEdit: true },
      globalData: {
        getUserInfo: () => ({ id: 'user1', name: 'Test User', roles: ['admin'] }),
        getConfig: (_key: string) => ({ theme: 'dark' }[_key]),
        getDictionary: (_type: string) => [
          { label: 'Option 1', value: 1 },
          { label: 'Option 2', value: 2 }
        ]
      },
      pageService: {
        showMessage: (_message: string, _type: 'success' | 'error' | 'warning') => {
          // Mock implementation
        },
        showConfirm: async (_message: string) => true,
        showLoading: (_show: boolean) => {
          // Mock implementation
        },
        navigate: (_path: string, _params?: Record<string, unknown>) => {
          // Mock implementation
        }
      },
      apiClient: {
        request: async <T>(_config: unknown): Promise<T> => {
          return { data: 'mock response' } as T
        }
      }
    })
  })

  it('should create manager with correct context', () => {
    const context = manager.getContext()
    expect(context.id).toBe('dataset:test-page')
    expect(context.type).toBe('dataset')
    expect(context.providers.size).toBeGreaterThan(0)
  })

  it('should register dataSetState capability', () => {
    const context = manager.getContext()
    const provider = context.providers.get(DATA_SET_STATE)
    
    expect(provider).toBeDefined()
    expect(provider?.implementation).toHaveProperty('getDataSet')
    expect(provider?.implementation).toHaveProperty('getTable')
    expect(provider?.implementation).toHaveProperty('getPageParams')
    expect(provider?.implementation).toHaveProperty('getPagePermission')
    expect(provider?.implementation).toHaveProperty('onTableChange')
  })

  it('should provide access to DataSet', () => {
    const context = manager.getContext()
    const provider = context.providers.get(DATA_SET_STATE)
    
    const ds = (provider?.implementation as any).getDataSet()
    expect(ds).toBe(mockDataSet)
  })

  it('should provide access to table', () => {
    const context = manager.getContext()
    const provider = context.providers.get(DATA_SET_STATE)
    
    const table = (provider?.implementation as any).getTable('Users')
    expect(table).toBeDefined()
    expect(table.rows.length).toBe(2)
  })

  it('should provide page params', () => {
    const context = manager.getContext()
    const provider = context.providers.get(DATA_SET_STATE)
    
    const params = (provider?.implementation as any).getPageParams()
    expect(params).toEqual({ id: '123' })
  })

  it('should provide page permissions', () => {
    const context = manager.getContext()
    const provider = context.providers.get(DATA_SET_STATE)
    
    const permissions = (provider?.implementation as any).getPagePermission()
    expect(permissions).toEqual({ canEdit: true })
  })

  it('should register globalData capability when provided', () => {
    const context = manager.getContext()
    const provider = context.providers.get(GLOBAL_DATA)
    
    expect(provider).toBeDefined()
    
    const userInfo = (provider?.implementation as any).getUserInfo()
    expect(userInfo).toEqual({ id: 'user1', name: 'Test User', roles: ['admin'] })
  })

  it('should register pageService capability when provided', () => {
    const context = manager.getContext()
    const provider = context.providers.get(PAGE_SERVICE)
    
    expect(provider).toBeDefined()
    expect(provider?.implementation).toHaveProperty('showMessage')
    expect(provider?.implementation).toHaveProperty('showConfirm')
    expect(provider?.implementation).toHaveProperty('navigate')
  })

  it('should register apiClient capability when provided', () => {
    const context = manager.getContext()
    const provider = context.providers.get(API_CLIENT)
    
    expect(provider).toBeDefined()
    expect(provider?.implementation).toHaveProperty('request')
  })

  it('should handle table change listeners', () => {
    const context = manager.getContext()
    const provider = context.providers.get(DATA_SET_STATE)
    
    let notified = false
    const unsubscribe = (provider?.implementation as any).onTableChange('Users', (_table: unknown) => {
      notified = true
    })
    
    expect(typeof unsubscribe).toBe('function')
    
    // 触发变化
    const table = mockDataSet.tables.Users
    if (table) {
      manager.notifyTableChange('Users', table)
    }
    expect(notified).toBe(true)
    
    // 取消订阅
    unsubscribe()
  })

  it('should update config', () => {
    manager.updateConfig({
      pageParams: { id: '456', newParam: 'value' }
    })
    
    const context = manager.getContext()
    const provider = context.providers.get(DATA_SET_STATE)
    const params = (provider?.implementation as any).getPageParams()
    
    expect(params).toEqual({ id: '456', newParam: 'value' })
  })

  it('should dispose resources', () => {
    manager.dispose()
    
    const context = manager.getContext()
    expect(context.providers.size).toBe(0)
    expect(context.consumers.size).toBe(0)
  })

  it('should create manager without optional capabilities', () => {
    const minimalManager = createDataSetCapabilityManager('minimal-page', {
      dataSet: mockDataSet
    })
    
    const context = minimalManager.getContext()
    const providers = Array.from(context.providers.values())
    
    // 只有 dataSetState
    expect(providers.length).toBe(1)
    expect(providers[0].name).toBe(DATA_SET_STATE)
  })
})
