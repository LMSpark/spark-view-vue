// features/spark/initialize.ts
// ⚠️ DEPRECATED: 使用 features/spark-ej2/initialize.ts 代替
// 此文件保留仅供向后兼容

import { initializeSparkEJ2Components } from '../spark-ej2'
import type { ComponentManager as ISparkComponentManager } from '@spark-view/spark-core'

/**
 * @deprecated 使用 initializeSparkEJ2Components 代替
 * 
 * 初始化应用特定的SPARK组件
 * 
 * 迁移指南：
 * ```ts
 * // 旧代码：
 * import { initializeAppSparkComponents } from './features/spark/initialize'
 * await initializeAppSparkComponents(manager)
 * 
 * // 新代码：
 * import { initializeSparkEJ2Components } from './features/spark-ej2'
 * await initializeSparkEJ2Components(manager)
 * ```
 */
export async function initializeAppSparkComponents(manager: ISparkComponentManager): Promise<void> {
  console.warn('⚠️ initializeAppSparkComponents is deprecated. Use initializeSparkEJ2Components from features/spark-ej2 instead.')
  return initializeSparkEJ2Components(manager)
}