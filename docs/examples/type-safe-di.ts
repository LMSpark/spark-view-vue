/**
 * DI 系统改进示例 - 类型映射表实现
 * 
 * 本文件展示如何通过类型映射表实现类型安全的 provide/consume API
 */

/* ============================================================================
 * 第一步：定义所有能力接口
 * ========================================================================= */

import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { IDataSet, DataTable } from '@spark-view/spark-data'

/**
 * APP 服务能力接口
 * 提供者: PageRenderer
 * 消费者: 所有组件
 */
export interface AppServicesCapability {
  router: {
    push(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
    replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
    back(): void
    currentRoute: RouteLocationNormalizedLoaded
  }
  logger: {
    debug(...args: unknown[]): void
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
}

/**
 * 数据源能力接口
 * 提供者: Grid/List 组件
 * 消费者: 子组件
 */
export interface DataSourceCapability<T = unknown> {
  /** 获取数据 */
  getData(): T[]
  /** 刷新数据 */
  refresh(): Promise<void>
  /** 数据总数 */
  getTotalCount(): number
}

/**
 * DataSet 状态能力接口
 * 提供者: DataSetManager
 * 消费者: 组件
 */
export interface DataSetStateCapability {
  /** 获取 DataSet 实例 */
  getDataSet(): IDataSet
  /** 获取指定表 */
  getTable(tableName: string): DataTable | undefined
  /** 监听表变化 */
  onTableChange(tableName: string, callback: (table: DataTable) => void): () => void
}

/**
 * 全局数据能力接口
 * 提供者: PageRenderer
 * 消费者: 组件
 */
export interface GlobalDataCapability {
  /** 用户信息 */
  getUserInfo(): { id: string; name: string; roles: string[] }
  /** 获取字典值 */
  getDictValue(dictType: string, code: string): string | undefined
  /** 获取字典列表 */
  getDictList(dictType: string): Array<{ code: string; label: string }>
}

/**
 * 页面服务能力接口
 * 提供者: PageRenderer
 * 消费者: 组件
 */
export interface PageServiceCapability {
  /** 显示成功消息 */
  showSuccess(message: string): void
  /** 显示错误消息 */
  showError(message: string): void
  /** 显示警告消息 */
  showWarning(message: string): void
  /** 显示确认对话框 */
  confirm(message: string, title?: string): Promise<boolean>
}

/**
 * API 客户端能力接口
 * 提供者: PageRenderer 或 ApiService
 * 消费者: 组件
 */
export interface ApiClientCapability {
  /** GET 请求 */
  get<T = unknown>(url: string, params?: Record<string, unknown>): Promise<T>
  /** POST 请求 */
  post<T = unknown>(url: string, data?: unknown): Promise<T>
  /** PUT 请求 */
  put<T = unknown>(url: string, data?: unknown): Promise<T>
  /** DELETE 请求 */
  delete<T = unknown>(url: string): Promise<T>
}

/**
 * 字段元数据能力接口
 * 提供者: Grid 组件
 * 消费者: Field 组件
 */
export interface FieldMetadataCapability {
  [field: string]: {
    label: string
    icon: string
    type: 'string' | 'number' | 'boolean' | 'date'
    format?: string
    editable?: boolean
  }
}

/**
 * 行数据能力接口
 * 提供者: Row 组件
 * 消费者: Field 组件
 */
export interface RowDataCapability<T = Record<string, unknown>> {
  /** 获取完整数据 */
  getData(): T
  /** 获取指定字段值 */
  getField(field: string): unknown
  /** 设置字段值 */
  setField(field: string, value: unknown): void
  /** 检查是否选中 */
  isSelected(): boolean
}

/**
 * 选择能力接口
 * 提供者: Grid/List 组件
 * 消费者: Row/Item 组件
 */
export interface SelectionCapability {
  /** 选中指定 ID */
  select(id: number | string): void
  /** 取消选中指定 ID */
  deselect(id: number | string): void
  /** 检查是否选中 */
  isSelected(id: number | string): boolean
  /** 获取所有选中的 ID */
  getSelectedIds(): Array<number | string>
  /** 清空选择 */
  clear(): void
  /** 全选 */
  selectAll(): void
}

/**
 * 验证能力接口
 * 提供者: Form 组件
 * 消费者: Field 组件
 */
export interface ValidationCapability {
  /** 验证字段 */
  validate(field: string): Promise<boolean>
  /** 验证所有字段 */
  validateAll(): Promise<boolean>
  /** 清除验证结果 */
  clearValidation(field?: string): void
  /** 获取错误信息 */
  getError(field: string): string | undefined
}

/**
 * Grid 事件能力接口
 * 提供者: Grid 组件
 * 消费者: 子组件
 */
export interface GridEventsCapability {
  /** 监听行点击 */
  on(event: 'row:click', handler: (data: unknown) => void): () => void
  /** 监听行双击 */
  on(event: 'row:dblclick', handler: (data: unknown) => void): () => void
  /** 监听选择变化 */
  on(event: 'selection:change', handler: (ids: Array<number | string>) => void): () => void
  /** 触发事件 */
  emit(event: string, ...args: unknown[]): void
}

/**
 * 行事件能力接口
 * 提供者: Row 组件
 * 消费者: Field 组件
 */
export interface RowEventsCapability {
  /** 监听行点击 */
  on(event: 'row:click', handler: (data: unknown) => void): () => void
  /** 监听字段变化 */
  on(event: 'field:change', handler: (field: string, value: unknown) => void): () => void
  /** 触发事件 */
  emit(event: string, ...args: unknown[]): void
}

/* ============================================================================
 * 第二步：导入 Symbol 定义
 * ========================================================================= */

import {
  APP_SERVICES,
  DATA_SOURCE,
  DATA_SET_STATE,
  GLOBAL_DATA,
  PAGE_SERVICE,
  API_CLIENT,
  FIELD_METADATA,
  ROW_DATA,
  SELECTION,
  VALIDATION,
  GRID_EVENTS,
  ROW_EVENTS
} from '@spark-view/spark-utils'

/* ============================================================================
 * 第三步：创建类型映射表
 * ========================================================================= */

/**
 * 能力类型映射表
 * 
 * 将 Symbol 映射到对应的能力接口类型，实现类型安全的 provide/consume。
 * 
 * 使用方式：
 * ```typescript
 * // ✅ 类型安全的 provide
 * provide(SELECTION, {
 *   select: (id) => { ... },
 *   deselect: (id) => { ... }
 * })
 * 
 * // ✅ 类型安全的 consume
 * const selection = consume(SELECTION) // 类型: SelectionCapability | null
 * ```
 */
export interface CapabilityTypeMap {
  [APP_SERVICES]: AppServicesCapability
  [DATA_SOURCE]: DataSourceCapability
  [DATA_SET_STATE]: DataSetStateCapability
  [GLOBAL_DATA]: GlobalDataCapability
  [PAGE_SERVICE]: PageServiceCapability
  [API_CLIENT]: ApiClientCapability
  [FIELD_METADATA]: FieldMetadataCapability
  [ROW_DATA]: RowDataCapability
  [SELECTION]: SelectionCapability
  [VALIDATION]: ValidationCapability
  [GRID_EVENTS]: GridEventsCapability
  [ROW_EVENTS]: RowEventsCapability
}

/* ============================================================================
 * 第四步：扩展 provide/consume 类型签名
 * ========================================================================= */

/**
 * 类型安全的 provide 函数
 * 
 * 通过泛型重载实现自动类型推导：
 * - 当使用映射表中的 Symbol 时，自动推导 implementation 参数类型
 * - 当使用未映射的 Symbol/字符串时，回退到原有行为
 */
export declare function provide<K extends keyof CapabilityTypeMap>(
  name: K,
  implementation: CapabilityTypeMap[K]
): void

export declare function provide(
  name: string | symbol,
  implementation?: Record<string, unknown>
): void

/**
 * 类型安全的 consume 函数
 * 
 * 通过泛型重载实现自动类型推导：
 * - 当使用映射表中的 Symbol 时，自动推导返回类型
 * - 当使用未映射的 Symbol/字符串时，回退到原有行为
 */
export declare function consume<K extends keyof CapabilityTypeMap>(
  name: K
): CapabilityTypeMap[K] | null

export declare function consume(
  name: string | symbol
): Record<string, unknown> | null

/**
 * 类型安全的 use 函数（consume 的别名）
 */
export declare function use<K extends keyof CapabilityTypeMap>(
  name: K
): CapabilityTypeMap[K] | null

export declare function use(
  name: string | symbol
): Record<string, unknown> | null

/* ============================================================================
 * 使用示例
 * ========================================================================= */

/**
 * 示例 1: 类型安全的 provide
 */
export function exampleProvide() {
  // ✅ 类型检查通过 - 接口匹配
  provide(SELECTION, {
    select: (id: number) => console.log('select', id),
    deselect: (id: number) => console.log('deselect', id),
    isSelected: (id: number) => false,
    getSelectedIds: () => [1, 2, 3],
    clear: () => console.log('clear'),
    selectAll: () => console.log('selectAll')
  })

  // ❌ 编译错误 - 缺少必需方法
  // provide(SELECTION, {
  //   select: (id: number) => console.log('select', id)
  // })

  // ❌ 编译错误 - 方法签名不匹配
  // provide(SELECTION, {
  //   select: (id: string) => console.log('select', id), // 应该是 number
  //   ...
  // })
}

/**
 * 示例 2: 类型安全的 consume
 */
export function exampleConsume() {
  // ✅ 自动推导类型: SelectionCapability | null
  const selection = consume(SELECTION)
  
  if (selection) {
    // ✅ 类型检查通过 - 方法存在
    selection.select(1)
    selection.clear()
    
    // ❌ 编译错误 - 方法不存在
    // selection.invalidMethod()
    
    // ❌ 编译错误 - 参数类型不匹配
    // selection.select('abc') // 应该是 number
  }

  // ✅ 使用 use 别名（推荐）
  const selection2 = use(SELECTION)
}

/**
 * 示例 3: 泛型支持（针对特定数据类型）
 */
export function exampleGeneric() {
  interface User {
    id: number
    name: string
    email: string
  }

  // 提供类型化的数据源
  provide(DATA_SOURCE, {
    getData: (): User[] => [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' }
    ],
    refresh: async () => { /* ... */ },
    getTotalCount: () => 2
  })

  // 消费时使用泛型指定数据类型
  const dataSource = consume(DATA_SOURCE)
  if (dataSource) {
    const users = dataSource.getData() // 类型: unknown[]
    // 如需强类型，可以使用类型断言或泛型参数
  }
}

/**
 * 示例 4: 向后兼容（使用字符串 capability name）
 */
export function exampleBackwardCompat() {
  // ✅ 仍然支持字符串（向后兼容）
  provide('custom-capability', { foo: 'bar' })
  const custom = consume('custom-capability') // 类型: Record<string, unknown> | null
}
