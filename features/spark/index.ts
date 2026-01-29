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

// Spark命名空间 - 统一组件API
export const Spark = {
  // 核心功能
  useComponent: useSparkComponent,
  initialize: initializeSparkComponents,
  isInitialized: isSparkComponentsInitialized,
  initializeApp: initializeAppSparkComponents,

  // 组件注册
  register: registerSparkComponent,
  registerMultiple: registerSparkComponents,
  get: getSparkComponent,
  registry: globalComponentRegistry,

  // 管理器（安全访问）
  manager: () => {
    const m = (typeof getGlobalSparkComponentManager === 'function') ? getGlobalSparkComponentManager() : undefined
    if (!m) {
      throw new Error('Spark.manager() is unavailable; ensure "@spark-view/spark-core" is initialized.')
    }
    return m
  },
  capabilities: () => {
    const c = (typeof getGlobalCapabilityManager === 'function') ? getGlobalCapabilityManager() : undefined
    if (!c) {
      throw new Error('Spark.capabilities() is unavailable; ensure "@spark-view/spark-core" is initialized.')
    }
    return c
  },

  // 工具函数（通过 Spark 命名空间暴露，保持向后兼容）
  logger: (...args: any[]) => getLogger(...args),

  // 预注册组件
  components: {
    EJ2Grid: SparkEJ2Grid,
    EJ2Column: SparkEJ2Column
  }
}

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