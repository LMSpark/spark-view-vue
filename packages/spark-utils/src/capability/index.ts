/**
 * SPARK 能力系统（统一模块）
 *
 * 按功能分区组织：应用服务 → 数据访问 → UI交互 → 事件系统
 *
 * 文件结构：
 * - types.ts            → ICapabilityContext, IEventEmitter 基础类型
 * - symbols.ts          → CapabilityKey, defineCapability, 符号常量 + 配套接口
 * - CapabilityManager.ts → 能力操作纯函数 + 事件工厂
 *
 * 导入风格：
 * ```ts
 * import { APP_SERVICES, provide, lookup } from '@spark-view/spark-utils'
 * ```
 */

// ==================== 基础类型 ====================

export type {
  CapabilityName,
  ICapabilityContext,
  IEventEmitter
} from './types.js'

// ==================== 符号 + 接口 ====================

export * from './symbols.js'
export type { CapabilityKey } from './symbols.js'

// ==================== 能力操作 + 事件工厂 ====================

export { provide, lookup, getLocal, createEventEmitter } from './CapabilityManager.js'