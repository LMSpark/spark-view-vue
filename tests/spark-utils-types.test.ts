/**
 * spark-utils 类型系统测试
 * 
 * 验证第 4 轮清理的核心类型变更：
 * - IDataRow<T> 泛型约束
 * - IDataRowWithPermission ≡ WithInstancePermission 一致性
 * - EventsCapability 基础接口提取
 * - CapabilityKey<T> 幻影类型
 * - Logger Transport 修复
 */

import { describe, it, expect } from 'vitest'
import {
  Logger,
  createConsoleTransport,
  createHttpTransport,
  createMemoryTransport,
  defineCapability,
  FieldVisibility,
  ComponentLevel,
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD
} from '@spark-view/spark-utils'
import type {
  IDataRow,
  IDataRowWithPermission,
  WithInstancePermission,
  WithModelPermission,
  IDataSource,
  IInstancePermission,
  IModelPermission,
  EventsCapability,
  GridEventsCapability,
  RowEventsCapability,
  AppServicesCapability,
  CapabilityKey,
  LogLevel,
  LoggerApi,
  Transport
} from '@spark-view/spark-utils'

// ============================================================================
// IDataRow<T> 泛型约束
// ============================================================================

describe('IDataRow type constraint', () => {
  it('accepts Record<string, unknown> by default', () => {
    const row: IDataRow = { id: 1, name: 'Alice' }
    expect(row.id).toBe(1)
    expect(row.name).toBe('Alice')
  })

  it('accepts typed data rows', () => {
    interface User { id: number; name: string }
    const row: IDataRow<User> = { id: 1, name: 'Alice' }
    expect(row.id).toBe(1)
  })

  // 编译时测试：以下应该报类型错误（无法在运行时验证，但确认类型设计正确）
  // const badRow: IDataRow<number> = 42 // TS Error: number does not extend Record<string, unknown>
})

// ============================================================================
// IDataRowWithPermission ≡ WithInstancePermission
// ============================================================================

describe('IDataRowWithPermission equals WithInstancePermission', () => {
  it('both types have identical structure', () => {
    const row1: IDataRowWithPermission = {
      id: 1,
      _perm: { allowDelete: true, editableFields: ['name'] }
    }
    // 可以赋值给 WithInstancePermission
    const row2: WithInstancePermission = row1
    expect(row2._perm?.allowDelete).toBe(true)
  })

  it('works with generics', () => {
    interface User { id: number; name: string }
    const row: IDataRowWithPermission<User> = {
      id: 1,
      name: 'Alice',
      _perm: { maskedFields: ['name'] }
    }
    // 也可以赋值给 WithInstancePermission<User>
    const asWIP: WithInstancePermission<User> = row
    expect(asWIP.name).toBe('Alice')
    expect(asWIP._perm?.maskedFields).toContain('name')
  })

  it('permission field is optional', () => {
    const row: IDataRowWithPermission = { id: 1 }
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
// EventsCapability 基础接口
// ============================================================================

describe('EventsCapability base interface', () => {
  it('GridEventsCapability and RowEventsCapability are type aliases', () => {
    // 创建符合 EventsCapability 的对象
    const events: EventsCapability = {
      on: (event: string, handler: (...args: unknown[]) => void) => {
        expect(typeof event).toBe('string')
        expect(typeof handler).toBe('function')
      },
      off: (event: string, handler: (...args: unknown[]) => void) => {
        expect(typeof event).toBe('string')
        expect(typeof handler).toBe('function')
      },
      emit: (event: string, ...args: unknown[]) => {
        expect(typeof event).toBe('string')
      }
    }

    // 可以赋值给 GridEventsCapability 和 RowEventsCapability
    const gridEvents: GridEventsCapability = events
    const rowEvents: RowEventsCapability = events
    expect(gridEvents).toBe(events)
    expect(rowEvents).toBe(events)
  })

  it('emit is optional', () => {
    const events: EventsCapability = {
      on: () => {},
      off: () => {}
    }
    expect(events.emit).toBeUndefined()
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
// Logger Transport 修复
// ============================================================================

describe('Logger transports', () => {
  it('createConsoleTransport returns Transport with level', () => {
    const transport = createConsoleTransport('warn')
    expect(transport.level).toBe('warn')
    expect(typeof transport.log).toBe('function')
  })

  it('createConsoleTransport defaults to info', () => {
    const transport = createConsoleTransport()
    expect(transport.level).toBe('info')
  })

  it('createHttpTransport returns Transport with level', () => {
    const transport = createHttpTransport('/api/logs', 'error')
    expect(transport.level).toBe('error')
    expect(typeof transport.log).toBe('function')
  })

  it('createMemoryTransport stores log entries', () => {
    const storage: unknown[] = []
    const transport = createMemoryTransport(storage)
    transport.log('info', 'hello', { key: 'val' })
    expect(storage).toHaveLength(1)
    const entry = storage[0] as { level: string; message: string; meta: unknown; ts: number }
    expect(entry.level).toBe('info')
    expect(entry.message).toBe('hello')
    expect(entry.meta).toEqual({ key: 'val' })
    expect(entry.ts).toBeGreaterThan(0)
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
