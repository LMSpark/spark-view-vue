import type { SparkNode } from '../../../internal'
import { nodeInputProp } from '../../../internal'

/**
 * 判断动作节点是否显示（display prop，非权限逻辑）。
 */
export function isActionDisplayed(action: SparkNode): boolean {
  return nodeInputProp(action, 'display') !== false
}
