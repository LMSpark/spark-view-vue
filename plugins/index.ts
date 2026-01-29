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

// Spark命名空间 - 统一API入口
export const Spark = {
  // 核心组件功能
  useComponent: useSparkComponent,
  initialize: initializeSparkComponents,
  isInitialized: isSparkComponentsInitialized,

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

  // 插件系统
  plugins: {
    manager: SparkPluginManager,
    debug: SparkDebugPlugin,
    performance: SparkPerformancePlugin,
    errorHandling: SparkErrorHandlingPlugin,
    global: globalPluginManager,
    install: installSparkPlugin,
    uninstall: uninstallSparkPlugin,
    get: getSparkPlugin
  },

  // 工具函数
  logger: getLogger
}

export type { SparkComponentConfig, SparkComponentContext, SparkCapabilityProvider, SparkCapabilityConsumer, SparkPlugin, SparkPluginHooks } from '@spark-view/spark-core'

// 导出命名的 Spark 命名空间，方便按名称导入
export { Spark }

// 默认导出 Spark 命名空间（向后兼容）
export default Spark