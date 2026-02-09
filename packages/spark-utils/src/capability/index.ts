/**
 * 能力系统
 */

export {
  createProvider as createEventProvider
} from './EventCapability.js'

// 导出基础类型
export type {
  CapabilityName,
  Provider,
  Consumer
} from './types.js'

// 导出事件能力
export type { EventProvider } from './EventCapability.js'

