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
