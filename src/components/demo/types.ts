/**
 * 演示组件的能力类型定义
 * 
 * 提供类型安全的能力接口，减少 as any 的使用
 */

import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * 用户数据类型
 */
export interface User {
  id: number
  name: string
  age: number
  email: string
  status: 'active' | 'inactive'
}

/**
 * Selection 能力接口
 */
export interface SelectionCapability {
  /** 选中指定 ID */
  select(id: number): void
  /** 取消选中指定 ID */
  deselect(id: number): void
  /** 检查是否选中 */
  isSelected(id: number): boolean
  /** 获取所有选中的 ID */
  getSelectedIds(): number[]
  /** 清空选择 */
  clear(): void
}

/**
 * Grid Events 能力接口
 */
export interface GridEventsCapability {
  /** 监听事件 */
  on(event: string, handler: (...args: unknown[]) => void): void
  /** 取消监听 */
  off(event: string, handler: (...args: unknown[]) => void): void
  /** 触发事件 */
  emit(event: string, ...args: unknown[]): void
}

/**
 * Row Data 能力接口
 */
export interface RowDataCapability {
  /** 获取完整数据 */
  getData(): User
  /** 获取指定字段值 */
  getField(field: string): unknown
  /** 检查是否选中 */
  isSelected(): boolean
}

/**
 * Row Events 能力接口
 */
export interface RowEventsCapability {
  /** 监听事件 */
  on(event: string, handler: (data: unknown) => void): void
  /** 取消监听 */
  off(event: string, handler: (data: unknown) => void): void
  /** 触发事件 */
  emit(event: string, data: unknown): void
}

/**
 * APP Router 能力接口
 */
export interface AppRouterCapability {
  /** 导航到新路由 */
  push(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
  /** 替换当前路由 */
  replace(to: string | { path: string; query?: Record<string, unknown> }): Promise<void | unknown>
  /** 返回上一页 */
  back(): void
  /** 当前路由 */
  currentRoute: RouteLocationNormalizedLoaded
}

/**
 * APP Logger 能力接口
 */
export interface AppLoggerCapability {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * APP Services 能力接口
 */
export interface AppServicesCapability {
  router?: AppRouterCapability
  logger?: AppLoggerCapability
  configLoader?: unknown
  authService?: unknown
}

/**
 * 类型安全的 consume 辅助函数
 */
export interface TypedConsume {
  <T = unknown>(name: string): { value: T | null } | null
}

/**
 * 能力名称到类型的映射
 */
export interface CapabilityTypeMap {
  selection: SelectionCapability
  gridEvents: GridEventsCapability
  rowData: RowDataCapability
  rowEvents: RowEventsCapability
  appServices: AppServicesCapability
  dataSource: User[]
}

/**
 * 类型安全的 consume 重载
 */
export function consumeTyped<K extends keyof CapabilityTypeMap>(
  name: K,
  consume: (name: string) => { value: unknown } | null
): { value: CapabilityTypeMap[K] | null } | null {
  const result = consume(name)
  return result as { value: CapabilityTypeMap[K] | null } | null
}
