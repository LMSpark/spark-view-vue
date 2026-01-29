// plugins/index.ts
// Vue插件入口文件 - Spark命名空间API

import {
  // 核心功能
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

  // 插件系统
  SparkPluginManager,
  SparkDebugPlugin,
  SparkPerformancePlugin,
  SparkErrorHandlingPlugin,
  globalPluginManager,
  installSparkPlugin,
  uninstallSparkPlugin,
  getSparkPlugin,

  // 类型
} from '@spark-view/spark-core'

// plugins/index.ts
// 简化：使用 core 提供的 Spark 命名导出以保持单一来源并减少运行时分歧
export { Spark } from '@spark-view/spark-core'

export type { SparkComponentConfig, SparkComponentContext, SparkCapabilityProvider, SparkCapabilityConsumer, SparkPlugin, SparkPluginHooks } from '@spark-view/spark-core'

export default Spark
