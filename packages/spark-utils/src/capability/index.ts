/**
 * SPARK 能力系统（统一模块）
 *
 * 按层级链组织：App → Page → DataSet → DataTable → DataView → UI组件 → UI子组件
 *
 * 文件结构（合并后）：
 * - types.ts            → Provider, Consumer, CapabilityContext 等基础类型
 * - symbols.ts          → CapabilityKey, defineCapability, 符号常量 + 配套接口
 * - CapabilityManager.ts → 能力管理器 + 事件能力工厂
 *
 * 两种导入风格：
 * ```ts
 * // 命名空间（推荐 — 签名最短）
 * import { Cap } from '@spark-view/spark-utils'
 * provide(Cap.APP_SERVICES, { router, logger })
 *
 * // 按需导入（少量符号时）
 * import { APP_SERVICES } from '@spark-view/spark-utils'
 * ```
 */

// ==================== 基础类型 ====================

export type {
  CapabilityName,
  Provider,
  Consumer,
  CapabilityContext
} from './types.js'

// ==================== 符号 + 接口 ====================

export * from './symbols.js'
export type { CapabilityKey } from './symbols.js'

// ==================== 管理器 + 事件工厂 ====================

export { createCapabilityManager, createEventProvider } from './CapabilityManager.js'
export type { ICapabilityManager, EventProvider } from './CapabilityManager.js'

// ==================== Cap 命名空间 ====================

import {
  APP_SERVICES,
  PAGE_SERVICE,
  DATA_SET,
  DATA_TABLE,
  DATA_VIEW,
  CURRENT_ROW,
  SELECTION,
  GRID_EVENTS,
  ROW_DATA,
  ROW_EVENTS,
  defineCapability,
} from './symbols.js'

import { createCapabilityManager, createEventProvider } from './CapabilityManager.js'

/**
 * Cap — 能力系统命名空间
 *
 * 将所有符号常量 + 工厂函数收敛到一个对象，消费方只需一次导入：
 *
 * ```ts
 * import { Cap } from '@spark-view/spark-utils'
 *
 * provide(Cap.APP_SERVICES, { router, logger })
 * const ds = consume(Cap.DATA_SET)
 * const mgr = Cap.createManager()
 * const { emitter } = Cap.createEvents('grid-events')
 * const MY_CAP = Cap.define<MyType>('my-cap')
 * ```
 */
export const Cap = {
  // L0 APP
  APP_SERVICES,
  // L1 PAGE
  PAGE_SERVICE,
  // L2 DATASET
  DATA_SET,
  // L3 DATATABLE
  DATA_TABLE,
  // L4 DATAVIEW
  DATA_VIEW,
  // L5 UI 表级
  CURRENT_ROW,
  SELECTION,
  GRID_EVENTS,
  // L6 UI 行级
  ROW_DATA,
  ROW_EVENTS,
  // 工厂
  define: defineCapability,
  createManager: createCapabilityManager,
  createEvents: createEventProvider,
} as const