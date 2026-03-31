import type { SparkNode } from '../internal'

type RuntimeActionConfig = SparkNode & { display?: boolean }

/**
 * 判断动作节点是否显示（display prop，非权限逻辑）。
 */
export function isActionDisplayed(action: SparkNode): boolean {
  return (action as RuntimeActionConfig).display !== false
}

// 权限纯函数统一收口在 permission/ 模块，此处仅做 re-export 保持向后兼容
export { isModelActionAllowed, isRowActionAllowed } from '../../permission/index.js'