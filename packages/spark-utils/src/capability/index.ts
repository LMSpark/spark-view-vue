/**
 * 能力系统 - 命名空间 API
 */

import type { Provider, Consumer, Context } from './types.js'
import {
  createProvider as createEventProvider,
  createConsumer as createEventConsumer,
  type EventProvider,
  type EventConsumer
} from './EventCapability.js'

// 导出基础类型供直接导入使用
export type {
  Provider,
  Consumer,
  Context
} from './types.js'
export type { EventProvider, EventConsumer } from './EventCapability.js'

// 向后兼容别名
export type CapabilityProvider<T = unknown> = Provider<T>
export type CapabilityConsumer = Consumer
export type CapabilityContext<T = Provider> = Context<T>

/**
 * 能力系统命名空间
 */
export namespace Capability {
  // 核心类型
  export type ProviderType<T = unknown> = Provider<T>
  export type ConsumerType = Consumer
  export type ContextType<T = Provider> = Context<T>

  // 事件能力（仅暴露创建函数）
  export namespace Events {
    export type ProviderType = EventProvider
    export type ConsumerType = EventConsumer
    export const createProvider = createEventProvider
    export const createConsumer = createEventConsumer
  }
}

