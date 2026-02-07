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
  register: (input: { name: string; path: string } | { type: string; component: unknown }) => void

  /** 批量注册组件 */
  registerAll: (configs: ({ name: string; path: string } | { type: string; component: unknown })[]) => void

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

  register(input: { name: string; path: string } | { type: string; component: unknown }) {
    // 方式 1: 简化配置 - name + path（自动转换为 type + loader）
    if ('name' in input && 'path' in input) {
      const config = input as { name: string; path: string }
      const standardConfig = createSimpleRegistration(config)
      return componentManager.registerComponent(standardConfig)
    }

    // 方式 2: 同步注册 - type + component
    if ('type' in input && 'component' in input) {
      const config = input as { type: string; component: unknown }
      const definition: ComponentDefinition = {
        type: config.type,
        name: config.type,
        component: config.component
      }
      return componentManager.registerComponent(definition)
    }

    throw new Error('❌ Invalid registration. Use: { name, path } or { type, component }')
  },

  registerAll(configs: ({ name: string; path: string } | { type: string; component: unknown })[]) {
    configs.forEach(config => this.register(config))
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
