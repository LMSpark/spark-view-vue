// features/spark/index.ts
// SPARK组件系统入口文件 - Spark命名空间API

import { Spark as CoreSpark } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../spark-ej2'

export const Spark = {
  ...CoreSpark,
  // 应用初始化（在 app 范围内注册应用特有的组件）
  initializeApp: initializeSparkEJ2Components
}

export default Spark

// 导出类型
export type {
  ComponentContext
} from '@spark-view/spark-component'

// 导出 EJ2 组件
export { SparkEJ2Grid, SparkEJ2Column } from '../spark-ej2'
