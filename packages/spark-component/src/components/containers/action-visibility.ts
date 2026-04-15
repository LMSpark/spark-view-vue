import type { SparkNode } from '../internal'

type RuntimeActionConfig = SparkNode & { display?: boolean }

/**
 * 判断动作节点是否显示（display prop，非权限逻辑）。
 */
export function isActionDisplayed(action: SparkNode): boolean {
  return (action as RuntimeActionConfig).display !== false
}
