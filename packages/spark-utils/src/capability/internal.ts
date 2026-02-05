/**
 * 内部 API - 仅供 SPARK 包系统内部使用
 * 外部用户只需要 provide/consume，不需要关心这些
 * 
 * @internal
 */

export type { Connector, Manager } from './types.js'
export {
  CapabilityManager,
  createManager
} from './CapabilitySystem.js'
export { EventConnector } from './EventCapability.js'
