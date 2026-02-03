/**
 * 能力系统导出
 * 通用的能力管理基础设施
 */

// 类型定义
export type {
  CapabilityProvider,
  CapabilityConsumer,
  CapabilityContext,
  CapabilityConnector,
  ICapabilityManager
} from './types.js'

// 核心实现
export {
  DataFlowConnector,
  EventConnector,
  MethodConnector,
  CapabilityManager,
  createCapabilityManager
} from './CapabilitySystem.js'

// 事件能力
export {
  EventCapabilityConnector,
  createEventCapabilityProvider,
  createEventCapabilityConsumer
} from './EventCapability.js'

export type {
  EventCapabilityProvider,
  EventCapabilityConsumer
} from './EventCapability.js'
