/**
 * SPARK 命名空间 - 统一的组件系统 API
 * 
 * 提供面向业务开发者的简化 API，隐藏内部实现细节
 * 所有组件系统功能通过 Spark 命名空间统一访问
 */

// ============================================================================
// 依赖导入
// ============================================================================

// 核心管理器（单例）
import { componentManager } from './utils/SparkComponentManager.js'
import { capabilityManager } from './capability/ComponentCapabilityManager.js'
import { componentRegistry } from './utils/SparkComponentRegistry.js'

// 工具函数
import { Logger } from '@spark-view/spark-utils'
import { getSparkPlugin, installSparkPlugin } from './plugins/SparkPluginSystem.js'
import { createVueSparkPlugin } from './plugins/VueSparkPlugin.js'
import { useSparkComponent } from './composables/useSparkComponent.js'
import { createComponentRegistry } from './utils/SparkComponentRegistry.js'
import { createComponentManager, createComponentSystem } from './utils/SparkComponentManager.js'
import { defineSparkComponent } from './vue/createSparkComponent.js'
import { 
  createSimpleRegistration
} from './helpers/registerHelper.js'

// 类型定义
import type { App, Plugin as VuePlugin } from 'vue'
import type { ComponentDefinition } from './types/spark-component.js'

// ============================================================================
// SPARK 命名空间类型定义
// ============================================================================

export const Spark: {
  // --------------------------------------------------------------------------
  // 核心 API - 业务开发者日常使用
  // --------------------------------------------------------------------------
  
  /** 安装 SPARK 插件到 Vue 应用 */
  install: (app: App) => void
  
  /** 
   * 注册组件 - 支持多种配置格式
   * - ComponentDefinition: 标准组件定义对象
   * - ComponentDefinition[]: 批量注册
   * - 简化配置: { name, path } 或 { name, component } （两者互斥）
   * - { spark?: {...} }: Vue 组件附带 spark 元数据
   */
  register: (input: ComponentDefinition | ComponentDefinition[] | { name: string; path: string } | { name: string; component: unknown } | { spark?: Pick<ComponentDefinition, 'type' | 'name'> }) => void
  
  /** 批量注册组件 */
  registerAll: (configs: (ComponentDefinition | { name: string; path: string } | { name: string; component: unknown })[]) => void
  
  // --------------------------------------------------------------------------
  // 组件开发 API - 创建和定义组件
  // --------------------------------------------------------------------------
  
  /** 在组件中使用 SPARK 功能（能力系统、上下文、日志等） */
  useSpark: typeof useSparkComponent
  
  /** 定义 SPARK 组件 - 创建带能力系统的 Vue 组件 */
  defineComponent: typeof defineSparkComponent
  
  /** 解析组件 - 处理 loader 和 component，返回实际组件 */
  resolveComponent: (type: string) => unknown
  
  // --------------------------------------------------------------------------
  // 高级 API - 能力系统管理
  // --------------------------------------------------------------------------
  
  /** 获取能力管理器 - 用于注册能力连接器等高级用法 */
  capabilities: () => typeof capabilityManager
  
  // --------------------------------------------------------------------------
  // 内部 API - 仅用于内部或特殊场景
  // --------------------------------------------------------------------------
  
  /** @internal 获取组件管理器单例 */
  _manager: () => typeof componentManager
  
  /** @internal 获取组件注册器单例 */
  _registry: () => typeof componentRegistry
  
  // --------------------------------------------------------------------------
  // 工厂方法 - 创建独立实例（用于隔离或测试）
  // --------------------------------------------------------------------------
  
  /** @advanced 创建独立的 Vue 插件实例 */
  createVuePlugin: typeof createVueSparkPlugin
  
  /** @advanced 创建独立的组件管理器实例 */
  createComponentManager: typeof createComponentManager
  
  /** @advanced 创建独立的组件注册器实例 */
  createComponentRegistry: typeof createComponentRegistry
  
  /** @advanced 创建隔离的组件系统（Manager + Registry 配套） */
  createComponentSystem: typeof createComponentSystem
  
  // --------------------------------------------------------------------------
  // 工具方法
  // --------------------------------------------------------------------------
  
  /** 日志工具 */
  Logger: typeof Logger
  
  /** 插件系统工具 */
  plugin: { 
    install: typeof installSparkPlugin
    get: typeof getSparkPlugin 
  }
  
  [key: string]: unknown
} = {
  // --------------------------------------------------------------------------
  // 核心 API 实现
  // --------------------------------------------------------------------------
  
  install(app: App) {
    const plugin = createVueSparkPlugin()
    app.use(plugin as VuePlugin)
  },
  
  register(input: ComponentDefinition | ComponentDefinition[] | { name: string; path: string } | { name: string; component: unknown } | { spark?: Pick<ComponentDefinition, 'type' | 'name'> }) {
    // 简化配置：检查是否有 'name' 但没有 'type'（简化格式）
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

    throw new Error('❌ Invalid registration input. Expected ComponentDefinition, ComponentDefinition[], or object with spark property.')
  },
  
  registerAll(configs: (ComponentDefinition | { name: string; path: string } | { name: string; component: unknown })[]) {
    configs.forEach(config => {
      if ('name' in config && !('type' in config)) {
        // 简化配置 - 自动转换
        const simpleConfig = config as { name: string; path: string } | { name: string; component: unknown }
        const standardConfig = createSimpleRegistration(simpleConfig)
        componentManager.registerComponent(standardConfig)
      } else {
        // 标准配置 - 直接注册
        componentManager.registerComponent(config)
      }
    })
  },
  
  // --------------------------------------------------------------------------
  // 组件开发 API 实现
  // --------------------------------------------------------------------------
  
  useSpark: useSparkComponent,
  defineComponent: defineSparkComponent,
  resolveComponent: (type: string) => componentManager.resolveComponent(type),
  
  // --------------------------------------------------------------------------
  // 高级 API 实现
  // --------------------------------------------------------------------------
  
  capabilities: () => capabilityManager,
  
  // --------------------------------------------------------------------------
  // 内部 API 实现
  // --------------------------------------------------------------------------
  
  _manager: () => componentManager,
  _registry: () => componentRegistry,
  
  // --------------------------------------------------------------------------
  // 工厂方法实现
  // --------------------------------------------------------------------------
  
  createVuePlugin: createVueSparkPlugin,
  createComponentManager,
  createComponentRegistry,
  createComponentSystem,
  
  // --------------------------------------------------------------------------
  // 工具方法实现
  // --------------------------------------------------------------------------
  
  Logger,
  
  plugin: {
    install: installSparkPlugin,
    get: getSparkPlugin
  }
}
