/**
 * 内部 API - 仅供 SPARK 包系统内部使用
 * 外部用户只需要 provide/consume，不需要关心这些
 * 
 * @internal
 * @deprecated 这些内部 API 将在未来版本中移除，请使用 provide/consume/consumeInherited
 */

export {
  CapabilityManager,
  createManager
} from './CapabilitySystem.js'
