import type { App } from 'vue'
import type { ComponentManager, ComponentRegistry, ComponentContext } from '../types/spark-component.js'
import { SPARK_MANAGER_KEY, SPARK_REGISTRY_KEY } from '../types/spark-component.js'
import type { CapabilityProvider, CapabilityConsumer } from '@spark-view/spark-utils'

export interface VueSparkPluginOptions {
  manager: ComponentManager
  registry?: ComponentRegistry
}

export function createVueSparkPlugin(options: VueSparkPluginOptions) {
  if (!options?.manager) throw new Error('VueSparkPlugin requires { manager } option. Provide a manager created by createComponentManager(registry)')
  const { manager, registry } = options
  
  // 创建 APP 级根上下文（最顶层上下文）
  const appContext: ComponentContext = {
    id: 'app-root-context',
    type: 'spark-app',
    parent: undefined,
    children: [],
    config: { type: 'spark-app', id: 'app-root-context' },
    state: {},
    providers: new Set<CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }
  
  // 创建页面级上下文（APP 的子上下文）
  const pageContext: ComponentContext = {
    id: 'page-root-context',
    type: 'spark-page',
    parent: appContext,
    children: [],
    config: { type: 'spark-page', id: 'page-root-context' },
    state: {},
    providers: new Set<CapabilityProvider>(),
    consumers: new Map<string, CapabilityConsumer>()
  }
  
  // 建立 APP → 页面的父子关系
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
