import type { App } from 'vue'
import type { ComponentRegistry, ComponentContext } from '../types/spark-component.js'
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js'
import type { Provider, Consumer } from '@spark-view/spark-utils'
import { createComponentManager, componentManager as defaultManager } from '../utils/SparkComponentManager.js'
import { componentRegistry as defaultRegistry } from '../utils/SparkComponentRegistry.js'

export interface VueSparkPluginOptions {
  /**
   * 组件注册表（可选）
   * - 如果提供：自动创建匹配的 manager 实例
   * - 如果省略：使用全局单例 manager + registry
   */
  registry?: ComponentRegistry
}

/**
 * 创建 SPARK Vue 插件
 * 
 * **设计理念**：业务开发者只需关心 Registry（注册组件定义）
 * Manager 由框架自动管理，对业务代码透明
 * 
 * @param options - 插件配置，可选
 *   - registry: 组件注册表，默认使用全局单例
 * 
 * @example
 * ```typescript
 * // 使用全局单例（最常见，推荐）
 * app.use(createVueSparkPlugin())
 * 
 * // 使用自定义注册表（多租户等场景）
 * const registry = createComponentRegistry()
 * app.use(createVueSparkPlugin({ registry }))
 * ```
 */
export function createVueSparkPlugin(options?: VueSparkPluginOptions) {
  // 如果提供了自定义registry，创建配对的manager；否则使用全局单例
  const registry = options?.registry ?? defaultRegistry
  const manager = options?.registry ? createComponentManager(undefined, registry) : defaultManager
  
  // 创建 APP 级根上下文（最顶层上下文）
  const appContext: ComponentContext = {
    id: 'app-root-context',
    type: 'spark-app',
    parent: undefined,
    children: [],
    state: { type: 'spark-app', id: 'app-root-context' },
    providers: new Map<string, Provider>(),
    consumers: new Map<string, Consumer>()
  }
  
  // 创建页面级上下文（APP 的子上下文）
  const pageContext: ComponentContext = {
    id: 'page-root-context',
    type: 'spark-page',
    parent: appContext,
    children: [],
    state: { type: 'spark-page', id: 'page-root-context' },
    providers: new Map<string, Provider>(),
    consumers: new Map<string, Consumer>()
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
