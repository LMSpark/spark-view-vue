/**
 * SPARK 能力系统（统一模块）
 *
 * 基于 Symbol 的依赖注入和能力提供/消费模式
 * 支持类型安全的组件间通信和功能扩展
 *
 * 导出结构：
 * - types.ts          → Provider, Consumer, CapabilityContext 等基础类型
 * - symbols.ts        → CapabilityKey, defineCapability, APP_SERVICES 等符号常量
 * - capability-types.ts → 各能力的接口定义
 * - CapabilityManager.ts → 通用能力管理器
 * - EventCapability.ts   → 事件能力工厂
 */

// ==================== 基础类型 ====================

export type {
  CapabilityName,
  Provider,
  Consumer,
  CapabilityContext
} from './types.js'

// ==================== 符号常量 + CapabilityKey ====================

export * from './symbols.js'
export type { CapabilityKey } from './symbols.js'

// ==================== 能力接口定义 ====================

export type {
  AppServicesCapability,
  AppRouterCapability,
  AppLoggerCapability,
  DataSourceCapability,
  DataSetStateCapability,
  IDataSetLike,
  IDataTableLike,
  GlobalDataCapability,
  PageServiceCapability,
  ApiClientCapability,
  FieldMetadataCapability,
  RowDataCapability,
  SelectionCapability,
  ValidationCapability,
  EventsCapability,
  GridEventsCapability,
  RowEventsCapability,
  GridInstanceCapability,
  ColumnManagerCapability,
  ColumnConfigCapability
} from './capability-types.js'

// ==================== 能力管理器 ====================

export { createCapabilityManager } from './CapabilityManager.js'
export type { ICapabilityManager } from './CapabilityManager.js'

// ==================== 事件能力 ====================

export {
  createProvider as createEventProvider
} from './EventCapability.js'

export type { EventProvider } from './EventCapability.js'

