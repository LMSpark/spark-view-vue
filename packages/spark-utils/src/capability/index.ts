/**
 * SPARK 能力系统
 *
 * 基于 Symbol 的依赖注入和能力提供/消费模式
 * 支持类型安全的组件间通信和功能扩展
 */

// ==================== 事件能力 ====================

/**
 * 事件能力提供者工厂函数
 */
export {
  createProvider as createEventProvider
} from './EventCapability.js'

// ==================== 类型定义 ====================

/**
 * 基础能力类型
 */
export type {
  CapabilityName,
  Provider,
  Consumer
} from './types.js'

/**
 * 事件能力相关类型
 */
export type { EventProvider } from './EventCapability.js'

