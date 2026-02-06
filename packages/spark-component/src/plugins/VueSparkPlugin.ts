import type { App } from 'vue'
import type { ComponentManager, ComponentRegistry, ComponentContext } from '../types/spark-component.js'
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js'
import type { CapabilityProvider, CapabilityConsumer } from '@spark-view/spark-utils'
import { componentManager as defaultManager } from '../utils/SparkComponentManager.js'
import { componentRegistry as defaultRegistry } from '../utils/SparkComponentRegistry.js'

export interface VueSparkPluginOptions {
  manager?: ComponentManager
  registry?: ComponentRegistry
}

/**
 * 创建 SPARK Vue 插件
 * 
 * @param options - 插件配置，可选
 *   - manager: 组件管理器，默认使用全局单例
 *   - registry: 组件注册表，默认使用全局单例
 * 
 * @example
 * ```typescript
 * // 使用默认全局单例（推荐）
 * app.use(Spark.createVuePlugin())
 * 
 * // 使用自定义实例（测试、多租户等场景）
 * const manager = Spark.createComponentManager()
 * app.use(Spark.createVuePlugin({ manager }))
 * ```
 */
export function createVueSparkPlugin(options?: VueSparkPluginOptions) {
  const manager = options?.manager ?? defaultManager
  const registry = options?.registry ?? defaultRegistry
  if (!manager) throw new Error('VueSparkPlugin: manager is required')
  
  // 创建 APP 级根上下文（最顶层上下文）
  const appContext: ComponentContext = {
    id: 'app-root-context',
    type: 'spark-app',
    parent: undefined,
    children: [],
    state: { type: 'spark-app', id: 'app-root-context' },
    providers: new Set<CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }
  
  // 创建页面级上下文（APP 的子上下文）
  const pageContext: ComponentContext = {
    id: 'page-root-context',
    type: 'spark-page',
    parent: appContext,
    children: [],
    state: { type: 'spark-page', id: 'page-root-context' },
    providers: new Set<CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }
  
  // 建立 APP → 页面的父子关系
  appContext.children ??= []
  appContext.children.push(pageContext)
  
  return {
    name: 'spark-vue-plugin',
    install(app: App) {
      // Provide strict DI into Vue app using Symbols (no magic strings)
      app.provide(SPARK_MANAGER_KEY, manager)
      if (registry) app.provide(SPARK_REGISTRY_KEY, registry)
      
      // 提供页面级上下文（当组件找不到父上下文时的默认上下文）
      app.provide('sparkParentContext', pageContext)
      // 提供 APP 级上下文（供特殊场景使用）
      app.provide('sparkAppContext', appContext)
    }
  } 
}
