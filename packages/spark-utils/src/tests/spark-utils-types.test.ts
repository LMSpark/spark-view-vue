/**
 * spark-utils 类型系统测试
 * 
 * 验证核心类型：
 * - IEventEmitter 接口
 * - CapabilityKey<T> 幻影类型
 * - Logger 基本功能
 */

import { describe, it, expect } from 'vitest'
import {
  Logger,
  defineCapability,
} from '@spark-view/spark-utils'
import {
  FieldVisibility,
  ComponentLevel,
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD
} from '@spark-view/spark-data'
import type {
  IDataRow,
  IDataSource,
} from '@spark-view/spark-data'
import type {
  LoggerApi,
  IEventEmitter
} from '@spark-view/spark-utils'

// ============================================================================
// IDataRow 类型
// ============================================================================

describe('IDataRow type constraint', () => {
  it('accepts Record<string, unknown> by default', () => {
    const row: IDataRow = { id: 1, name: 'Alice' }
    expect(row['id']).toBe(1)
    expect(row['name']).toBe('Alice')
  })

  it('supports _perm field', () => {
    const row: IDataRow = {
      id: 1,
      _perm: { allowDelete: true, editableFields: ['name'] }
    }
    expect(row._perm?.allowDelete).toBe(true)
  })

  it('permission field is optional', () => {
    const row: IDataRow = { id: 1 }
    expect(row._perm).toBeUndefined()
  })
})

// ============================================================================
// IDataSource 类型
// ============================================================================

describe('IDataSource type', () => {
  it('holds rows with permissions and pagination', () => {
    const ds: IDataSource = {
      rows: [
        { id: 1, _perm: { allowDelete: true } },
        { id: 2 }
      ],
      _modelPerm: { allowCreate: true, allowExport: false },
      total: 100,
      page: 1,
      pageSize: 20
    }
    expect(ds.rows).toHaveLength(2)
    expect(ds._modelPerm?.allowCreate).toBe(true)
    expect(ds.total).toBe(100)
  })
})

// ============================================================================
// IEventEmitter 接口
// ============================================================================

describe('IEventEmitter interface', () => {
  it('IEventEmitter has on/off/emit methods', () => {
    const emitter: IEventEmitter = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        expect(typeof event).toBe('string')
        expect(typeof handler).toBe('function')
      },
      off: (event: string, handler: (...args: unknown[]) => void) => {
        expect(typeof event).toBe('string')
        expect(typeof handler).toBe('function')
      },
      emit: (event: string, ..._args: unknown[]) => {
        expect(typeof event).toBe('string')
      },
      removeAllListeners: (_event?: string) => {},
      listenerCount: (_event?: string) => 0
    }

    expect(emitter).toBeTruthy()
  })
})

// ============================================================================
// CapabilityKey<T> 幻影类型
// ============================================================================

describe('CapabilityKey phantom type', () => {
  it('defineCapability returns a symbol', () => {
    const key = defineCapability<{ value: number }>('test:key')
    expect(typeof key).toBe('symbol')
  })

  it('same name returns same symbol (Symbol.for)', () => {
    const key1 = defineCapability<{ a: 1 }>('test:same-name')
    const key2 = defineCapability<{ b: 2 }>('test:same-name')
    expect(key1).toBe(key2)
  })

  it('different names return different symbols', () => {
    const key1 = defineCapability<{ a: 1 }>('test:name-a')
    const key2 = defineCapability<{ a: 1 }>('test:name-b')
    expect(key1).not.toBe(key2)
  })
})

// ============================================================================
// Logger 基本功能
// ============================================================================

describe('Logger basic', () => {
  it('creates logger without context', () => {
    const logger = Logger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('logger conforms to LoggerApi interface', () => {
    const logger: LoggerApi = Logger()
    // 每个方法都接受 ...args: unknown[]
    logger.debug('test debug')
    logger.info('test info')
    logger.warn('test warn')
    logger.error('test error')
  })
})

// ============================================================================
// 权限常量
// ============================================================================

describe('Permission constants', () => {
  it('INSTANCE_PERMISSION_FIELD is _perm', () => {
    expect(INSTANCE_PERMISSION_FIELD).toBe('_perm')
  })

  it('MODEL_PERMISSION_FIELD is _modelPerm', () => {
    expect(MODEL_PERMISSION_FIELD).toBe('_modelPerm')
  })

  it('FieldVisibility enum values', () => {
    expect(FieldVisibility.Visible).toBe('visible')
    expect(FieldVisibility.Masked).toBe('masked')
    expect(FieldVisibility.Hidden).toBe('hidden')
  })

  it('ComponentLevel enum values', () => {
    expect(ComponentLevel.Model).toBe('model')
    expect(ComponentLevel.Instance).toBe('instance')
    expect(ComponentLevel.Field).toBe('field')
  })
})
