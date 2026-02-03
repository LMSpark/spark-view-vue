// features/spark/index.ts
// SPARK组件系统入口文件 - Spark命名空间API

import { Spark as CoreSpark } from '@spark-view/spark-component'
import { initializeSparkEJ2Components } from '../spark-ej2'

export const Spark = {
  ...CoreSpark,
  // 应用初始化（在 app 范围内注册应用特有的组件）
  // 要求：必须传入 `IComponentManager` 实例以避免隐式单例依赖
  // ⚠️ DEPRECATED: 使用 initializeSparkEJ2Components 代替
  initializeApp: initializeSparkEJ2Components
}

export default Spark

// 导出类型
export type {
  ComponentConfig,
  ComponentContext,
  CapabilityProvider,
  CapabilityConsumer
} from '@spark-view/spark-component'

// ⚠️ DEPRECATED: 从 features/spark-ej2 导入
// import { SparkEJ2Grid, SparkEJ2Column } from '../spark-ej2'
export { SparkEJ2Grid, SparkEJ2Column } from '../spark-ej2'
