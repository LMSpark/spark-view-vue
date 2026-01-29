// features/spark/index.ts
// SPARK组件系统入口文件 - Spark命名空间API

import {
  useSparkComponent,
  initializeSparkComponents,
  isSparkComponentsInitialized,
  registerSparkComponents,
  registerSparkComponent,
  getSparkComponent,
  globalComponentRegistry,
  getLogger,
  getGlobalSparkComponentManager,
  getGlobalCapabilityManager,
  type SparkComponentConfig,
  type SparkComponentContext,
  type SparkCapabilityProvider,
  type SparkCapabilityConsumer
} from '@spark-view/spark-core'

// 导入应用特定的组件
import { initializeAppSparkComponents } from './initialize'
import SparkEJ2Grid from './components/ej2/SparkEJ2Grid.vue'
import SparkEJ2Column from './components/ej2/SparkEJ2Column.vue'

// 使用 core 的 Spark 命名导出作为基础，并扩展应用特定初始化函数
import { Spark as CoreSpark } from '@spark-view/spark-core'
import { initializeAppSparkComponents } from './initialize'

export const Spark = {
  ...CoreSpark,
  // 应用初始化（在 app 范围内注册应用特有的组件）
  initializeApp: initializeAppSparkComponents
}

export default Spark

// 导出应用预注册组件（保持向后兼容）
export { SparkEJ2Grid, SparkEJ2Column }

// 导出类型
export type {
  SparkComponentConfig,
  SparkComponentContext,
  SparkCapabilityProvider,
  SparkCapabilityConsumer
}

// 导出组件（保持向后兼容）
export { SparkEJ2Grid, SparkEJ2Column }

// 默认导出Spark命名空间
export default Spark