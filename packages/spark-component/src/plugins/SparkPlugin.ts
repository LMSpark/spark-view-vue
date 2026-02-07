/**
 * SPARK Vue 插件
 *
 * 职责：
 * - 创建并注入 Registry
 * - 创建根上下文（sparkParentContext）
 * - 极简，只做 DI
 */

import type { App, Plugin } from 'vue'
import { SPARK_REGISTRY_KEY } from '../core/types.js'
import type { ComponentContext, ComponentRegistry, CapabilityProvider, CapabilityConsumer } from '../core/types.js'
import { Spark } from '../spark.js'

export interface SparkPluginOptions {
  /** 自定义注册表（测试/隔离场景用） */
  registry?: ComponentRegistry
}

export function createSparkPlugin(options?: SparkPluginOptions): Plugin {
  return {
    install(app: App) {
      // 默认使用全局 registry，确保 Spark.register() 注册的组件可被找到
      const registry = options?.registry ?? Spark.getRegistry()

      // 创建应用级根上下文
      const rootContext: ComponentContext = {
        id: 'spark-root',
        type: 'spark-app',
        children: [],
        state: {},
        providers: new Map<string, CapabilityProvider>(),
        consumers: new Map<string, CapabilityConsumer>()
      }

      // 注入到 Vue DI
      app.provide(SPARK_REGISTRY_KEY, registry)
      app.provide('sparkParentContext', rootContext)

      // 全局属性（可选，方便模板中使用）
      app.config.globalProperties.$sparkRegistry = registry
    }
  }
}
