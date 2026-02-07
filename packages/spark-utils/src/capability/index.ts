/**
 * 能力系统
 */

export {
  createProvider as createEventProvider
} from './EventCapability.js'

// 导出基础类型
export type {
  Provider,
  Consumer,
  Context
} from './types.js'

// 导出辅助函数
export {
  provide,
  consume
} from './types.js'

// 导出事件能力
export type { EventProvider } from './EventCapability.js'

