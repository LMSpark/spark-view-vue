/**
 * SPARK 命名空间 - 统一的组件系统 API
 *
 * 提供面向业务开发者的简化 API
 */

// 核心管理器（单例）
import { componentManager } from './utils/SparkComponentManager.js'
import { capabilityManager } from './capability/ComponentCapabilityManager.js'
import { componentRegistry } from './utils/SparkComponentRegistry.js'

// 工具函数
import { Logger } from '@spark-view/spark-utils'
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { createVueSparkPlugin } from './plugins/VueSparkPlugin.js'
import {
  createSimpleRegistration
} from './helpers/registerHelper.js'

// 类型定义
import type { App, Plugin as VuePlugin } from 'vue'
import type { ComponentDefinition } from './types/spark-component.js'

/**
 * SPARK 命名空间
 */
export const Spark: {
  /** 安装 SPARK 插件到 Vue 应用 */
  install: (app: App) => void

  /** 注册组件 */
  register: (input: ComponentDefinition | ComponentDefinition[] | { name: string; path: string } | { name: string; component: unknown } | { spark?: Pick<ComponentDefinition, 'type' | 'name'> }) => void

  /** 批量注册组件 */
  registerAll: (configs: (ComponentDefinition | { name: string; path: string } | { name: string; component: unknown })[]) => void

  /** 解析组件 */
  resolveComponent: (type: string) => unknown

  /** 获取能力管理器 */
  capabilities: () => typeof capabilityManager

  /** @internal 获取组件管理器单例 */
  _manager: () => typeof componentManager

  /** @internal 获取组件注册器单例 */
  _registry: () => typeof componentRegistry

  /** 日志工具 */
  Logger: typeof Logger

  /** 插件系统工具 */
  plugin: {
    install: typeof installSparkPlugin
    get: typeof getSparkPlugin
  }

  [key: string]: unknown
} = {
  install(app: App) {
    const plugin = createVueSparkPlugin()
    app.use(plugin as VuePlugin)
  },

  register(input: ComponentDefinition | ComponentDefinition[] | { name: string; path: string } | { name: string; component: unknown } | { spark?: Pick<ComponentDefinition, 'type' | 'name'> }) {
    // 简化配置：检查是否有 'name' 但没有 'type'
    if (input && typeof input === 'object' && 'name' in input && !('type' in input) && !Array.isArray(input)) {
      const config = input as { name: string; path: string } | { name: string; component: unknown }
      const standardConfig = createSimpleRegistration(config)
      return componentManager.registerComponent(standardConfig)
    }

    // 批量注册：处理组件数组
    if (Array.isArray(input)) {
      input.forEach(def => componentManager.registerComponent(def))
      return
    }

    // Vue 组件附带 spark 元数据
    if (input && typeof input === 'object' && 'spark' in input) {
      const component = input as { spark?: Pick<ComponentDefinition, 'type' | 'name'> }
      if (!component.spark) {
        throw new Error('Component must have spark meta attached')
      }
      const meta = component.spark

      const definition: ComponentDefinition = {
        type: meta.type,
        name: meta.name ?? meta.type,
        component: component
      }
      return componentManager.registerComponent(definition)
    }

    // 标准配置：直接注册 ComponentDefinition
    if (input && typeof input === 'object') {
      return componentManager.registerComponent(input as ComponentDefinition)
    }

    throw new Error('❌ Invalid registration input.')
  },

  registerAll(configs: (ComponentDefinition | { name: string; path: string } | { name: string; component: unknown })[]) {
    configs.forEach(config => {
      if ('name' in config && !('type' in config)) {
        const simpleConfig = config as { name: string; path: string } | { name: string; component: unknown }
        const standardConfig = createSimpleRegistration(simpleConfig)
        componentManager.registerComponent(standardConfig)
      } else {
        componentManager.registerComponent(config)
      }
    })
  },

  resolveComponent: (type: string) => componentManager.resolveComponent(type),

  capabilities: () => capabilityManager,

  _manager: () => componentManager,
  _registry: () => componentRegistry,

  Logger,

  plugin: {
    install: installSparkPlugin,
    get: getSparkPlugin
  }
}
