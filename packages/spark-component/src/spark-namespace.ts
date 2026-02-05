// Package-level SPARK namespace - 面向业务开发者的简化 API
// Import runtime entry points from source implementations to avoid built dist dependency
import { componentManager } from './utils/SparkComponentManager.js'
import { capabilityManager } from './capability/ComponentCapabilityManager.js'
import { componentRegistry } from './utils/SparkComponentRegistry.js'
import { Logger } from '@spark-view/spark-utils'

import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { createVueSparkPlugin } from './plugins/VueSparkPlugin.js'
import { useSparkComponent } from './composables/useSparkComponent.js'
import { createComponentRegistry } from './utils/SparkComponentRegistry.js'
import { createComponentManager } from './utils/SparkComponentManager.js'
import { defineSparkComponent } from './vue/createSparkComponent.js'
import { 
  createSimpleRegistration,
  presets as registerPresets,
  nameToType
} from './helpers/registerHelper.js'
import type { SimpleComponentConfig } from './helpers/registerHelper.js'

import type { App, Plugin as VuePlugin } from 'vue'
import type { ComponentConfig } from './types/spark-component.js' 

export const Spark: {
  // ========================================
  // 业务开发者 API（推荐使用）
  // ========================================
  
  /** 安装 SPARK 插件到 Vue 应用 */
  install: (app: App) => void
  
  /** 注册组件（支持简化配置和完整配置） */
  register: (input: ComponentConfig | ComponentConfig[] | SimpleComponentConfig | { spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'> }) => void
  
  /** 批量注册组件 */
  registerAll: (configs: (ComponentConfig | SimpleComponentConfig)[]) => void
  
  /** 预设配置生成器 */
  presets: typeof registerPresets
  
  /** 名称转类型工具 */
  nameToType: typeof nameToType
  
  // ========================================
  // Composables & Components
  // ========================================
  
  /** 在组件中使用 SPARK 功能 */
  useComponent: typeof useSparkComponent
  useSparkComponent: typeof useSparkComponent
  
  /** 定义 SPARK 组件 */
  defineComponent: typeof defineSparkComponent
  
  // ========================================
  // 内部 API（高级用法，不推荐直接使用）
  // ========================================
  
  /** @internal 获取组件管理器（仅用于内部或高级场景） */
  _manager: () => typeof componentManager
  
  /** @internal 获取能力管理器（仅用于内部或高级场景） */
  _capabilities: () => typeof capabilityManager
  
  /** @internal 获取组件注册器（仅用于内部或高级场景） */
  _registry: () => typeof componentRegistry
  
  /** @deprecated 使用 register() 代替 */
  registerSparkComponent: (input: ComponentConfig | ComponentConfig[] | { spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'> }) => void
  
  /** @advanced 创建独立的 Vue 插件实例（仅用于特殊场景） */
  createVuePlugin: typeof createVueSparkPlugin
  
  /** @advanced 创建独立的组件管理器（仅用于特殊场景） */
  createComponentManager: typeof createComponentManager
  
  /** @advanced 创建独立的组件注册器（仅用于特殊场景） */
  createComponentRegistry: typeof createComponentRegistry
  
  // Legacy aliases
  createRegistry: typeof createComponentRegistry
  createManager: typeof createComponentManager
  Logger: typeof Logger
  createLogger: typeof Logger
  plugin: { install: typeof installSparkPlugin; get: typeof getSparkPlugin }
  
  [key: string]: unknown
} = {
  // ========================================
  // 业务开发者 API
  // ========================================
  
  install(app: App) {
    const plugin = createVueSparkPlugin({ manager: componentManager, registry: componentRegistry })
    app.use(plugin as VuePlugin)
  },
  
  register(input: ComponentConfig | ComponentConfig[] | SimpleComponentConfig | { spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'> }) {
    // Check if it's a SimpleComponentConfig (has 'name' but not 'type')
    if (input && typeof input === 'object' && 'name' in input && !('type' in input) && !Array.isArray(input)) {
      const simpleConfig = input as SimpleComponentConfig
      const standardConfig = createSimpleRegistration(simpleConfig)
      return componentManager.registerComponent(standardConfig)
    }

    // Handle array of components
    if (Array.isArray(input)) {
      input.forEach(def => componentManager.registerComponent(def))
      return
    }

    // Handle Vue component with spark meta
    if (input && typeof input === 'object' && 'spark' in input) {
      const component = input as { spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'> }
      if (!component.spark) {
        throw new Error('Component must have spark meta attached')
      }
      const meta = component.spark
      
      const definition: ComponentConfig = {
        type: meta.type,
        name: meta.name ?? meta.type,
        version: meta.version ?? '1.0.0',
        component: component,
        providers: meta.providers ?? [],
        validator: meta.validator
      }
      return componentManager.registerComponent(definition)
    }

    // Handle single ComponentConfig
    if (input && typeof input === 'object') {
      return componentManager.registerComponent(input as ComponentConfig)
    }

    throw new Error('❌ Invalid registration input. Expected ComponentConfig, ComponentConfig[], or object with spark property.')
  },
  
  registerAll(configs: (ComponentConfig | SimpleComponentConfig)[]) {
    configs.forEach(config => {
      if ('name' in config && !('type' in config)) {
        // SimpleComponentConfig
        const standardConfig = createSimpleRegistration(config as SimpleComponentConfig)
        componentManager.registerComponent(standardConfig)
      } else {
        // ComponentConfig
        componentManager.registerComponent(config as ComponentConfig)
      }
    })
  },
  
  presets: registerPresets,
  
  nameToType,
  
  // ========================================
  // Composables & Components
  // ========================================
  
  useComponent: useSparkComponent,
  useSparkComponent,
  defineComponent: defineSparkComponent,
  
  // ========================================
  // 内部 API
  // ========================================
  
  _manager: () => componentManager,
  _capabilities: () => capabilityManager,
  _registry: () => componentRegistry,
  
  registerSparkComponent(input) {
    const logger = Logger()
    logger.warn('⚠️ registerSparkComponent is deprecated. Please use Spark.register() instead.')
    return Spark.register(input)
  },
  
  // ========================================
  // 高级 API
  // ========================================
  
  createVuePlugin: createVueSparkPlugin,
  createComponentManager,
  createComponentRegistry,
  createRegistry: createComponentRegistry,
  createManager: createComponentManager,
  
  // ========================================
  // Legacy APIs (for backward compatibility)
  // ========================================
  
  Logger,
  createLogger: Logger,
  
  plugin: {
    install: installSparkPlugin,
    get: getSparkPlugin
  },
  
  // Legacy methods (deprecated)
  registerLogical: (config: ComponentConfig) => {
    const logger = Logger()
    logger.warn('⚠️ registerLogical is deprecated. Use Spark.register() instead.')
    return componentManager.registerComponent(config)
  },
  
  getSparkComponent: (type: string) => {
    const logger = Logger()
    logger.warn('⚠️ getSparkComponent is deprecated. Use Spark._registry().get() instead.')
    return componentRegistry.get(type)
  },
  
  registerComponent: (def: ComponentConfig) => {
    const logger = Logger()
    logger.warn('⚠️ registerComponent is deprecated. Use Spark.register() instead.')
    return componentManager.registerComponent(def)
  },
  
  registerComponents: (defs: ComponentConfig[]) => {
    const logger = Logger()
    logger.warn('⚠️ registerComponents is deprecated. Use Spark.registerAll() instead.')
    return defs.forEach(def => componentManager.registerComponent(def))
  },
  
  render: (config: ComponentConfig) => {
    const logger = Logger()
    logger.warn('⚠️ Spark.render is deprecated. Use <SparkComponentRenderer> instead.')
    return config
  },
  
  initialize: async () => {
    const logger = Logger()
    logger.warn('⚠️ Spark.initialize is deprecated and does nothing.')
  }
}
