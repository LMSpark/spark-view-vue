/**
 * SPARK Vue 插件
 *
 * 职责：
 * - 创建并注入 Registry
 * - 创建根上下文（sparkParentContext）
 * - 极简，只做 DI
 */

import type { App, Plugin } from 'vue'
import { markRaw } from 'vue'
import { SPARK_REGISTRY_KEY, SPARK_PARENT_CONTEXT_KEY } from '../core/types.js'
import type { ComponentContext, ComponentRegistry } from '../core/types.js'
import type { CapabilityName } from '@spark-view/spark-utils'
import { getGlobalRegistry } from '../registry/ComponentRegistry.js'

export interface SparkPluginOptions {
  /** 自定义注册表（测试/隔离场景用） */
  registry?: ComponentRegistry
}

export function createSparkPlugin(options?: SparkPluginOptions): Plugin {
  return {
    install(app: App) {
      // 默认使用全局 registry，确保 Spark.register() 注册的组件可被找到
      const registry = options?.registry ?? getGlobalRegistry()

      // 创建应用级根上下文（capabilities / children markRaw：不需要响应式）
      const rootContext: ComponentContext = {
        id: 'spark-root',
        type: 'spark-app',
        children: markRaw([]),
        state: {},
        capabilities: markRaw(new Map<CapabilityName, unknown>())
      }

      // 注入到 Vue DI（使用类型安全的 InjectionKey）
      app.provide(SPARK_REGISTRY_KEY, registry)
      app.provide(SPARK_PARENT_CONTEXT_KEY, rootContext)
    }
  }
}
