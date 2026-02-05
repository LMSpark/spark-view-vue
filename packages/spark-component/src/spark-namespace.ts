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
  // 业务开发者 API（核心功能）
  // ========================================
  
  /** 安装 SPARK 插件到 Vue 应用 */
  install: (app: App) => void
  
  /** 注册组件 - 支持简化配置和完整配置 */
  register: (input: ComponentConfig | ComponentConfig[] | SimpleComponentConfig | { spark?: Pick<ComponentConfig, 'type' | 'name' | 'version' | 'providers' | 'validator'> }) => void
  
  /** 批量注册组件 */
  registerAll: (configs: (ComponentConfig | SimpleComponentConfig)[]) => void
  
  // ========================================
  // 辅助工具
  // ========================================
  
  /** 预设配置生成器 */
  presets: typeof registerPresets
  
  /** 名称转类型工具 */
  nameToType: typeof nameToType
  
  // ========================================
  // 组件开发 API（能力系统）
  // ========================================
  
  /** 获取能力管理器（用于注册能力连接器等高级用法） */
  capabilities: () => typeof capabilityManager
  
  /** 定义 SPARK 组件 */
  defineComponent: typeof defineSparkComponent
  
  /** 解析组件（处理 loader 和 component） */
  resolveComponent: (type: string) => unknown

  // ========================================
  // 组合式 API
  // ========================================
  
  /** 在组件中使用 SPARK 功能（能力系统、上下文、日志等） */
  useSpark: typeof useSparkComponent
  
  // ========================================
  // 内部 API（高级用法，不推荐直接使用）
  // ========================================
  
  /** @internal 获取组件管理器（仅用于内部或高级场景） */
  _manager: () => typeof componentManager
  
  /** @internal 获取组件注册器（仅用于内部或高级场景） */
  _registry: () => typeof componentRegistry
  
  /** @advanced 创建独立的 Vue 插件实例（仅用于特殊场景） */
  createVuePlugin: typeof createVueSparkPlugin
  
  /** @advanced 创建独立的组件管理器（仅用于特殊场景） */
  createComponentManager: typeof createComponentManager
  
  /** @advanced 创建独立的组件注册器（仅用于特殊场景） */
  createComponentRegistry: typeof createComponentRegistry
  
  // 工具方法
  Logger: typeof Logger
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
      const simpleConfig = input
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
        const standardConfig = createSimpleRegistration(config)
        componentManager.registerComponent(standardConfig)
      } else {
        // ComponentConfig
        componentManager.registerComponent(config)
      }
    })
  },
  
  presets: registerPresets,
  
  nameToType,
  
  // ========================================
  // 组件开发 API
  // ========================================
  
  useSpark: useSparkComponent,
  capabilities: () => capabilityManager,
  defineComponent: defineSparkComponent,
  
  resolveComponent: (type: string) => componentManager.resolveComponent(type),

  // ========================================
  // 向后兼容别名
  // ========================================
  
  // ========================================
  // 内部 API
  // ========================================
  
  _manager: () => componentManager,
  _registry: () => componentRegistry,
  
  // ========================================
  // 高级 API
  // ========================================
  
  createVuePlugin: createVueSparkPlugin,
  createComponentManager,
  createComponentRegistry,
  
  // ========================================
  // 工具方法
  // ========================================
  
  Logger,
  
  plugin: {
    install: installSparkPlugin,
    get: getSparkPlugin
  }
}
