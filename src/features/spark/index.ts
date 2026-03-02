// features/spark/index.ts
// SPARK 组件系统入口文件 — 扩展 CoreSpark 命名空间

import { Spark as CoreSpark } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../spark-ej2'

/**
 * 应用级 Spark 命名空间
 *
 * 继承 CoreSpark 的全部 API，并添加应用特有的初始化方法。
 * 使用 Object.create 保留原型链，避免 spread 丢失 this 绑定。
 */
export const Spark: typeof CoreSpark & { initializeApp: typeof initializeSparkEJ2Components } = Object.assign(
  Object.create(CoreSpark),
  CoreSpark,
  { initializeApp: initializeSparkEJ2Components }
)

export default Spark

export type { ComponentContext } from '@spark-view/spark-component'
export { SparkEJ2Grid, SparkEJ2Column } from '../spark-ej2'
