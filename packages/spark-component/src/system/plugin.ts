/**
 * SPARK Vue 插件
 *
 * 职责：
 * - 创建并注入 Registry
 * - 创建根上下文（sparkParentContext）
 * - 极简，只做 DI
 */

import type { App, Plugin } from 'vue'
import { shallowReactive } from 'vue'
import { SPARK_REGISTRY_KEY } from '../core/types.js'
import type { SparkCapabilityContext, ComponentRegistry } from '../core/types.js'
import { INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY } from '../internal/capability-context.js'
import type { CapabilityName } from '@spark-view/spark-utils'
import { getGlobalRegistry } from './registry.js'
import { DataView } from '@spark-view/spark-data'

export interface SparkPluginOptions {
  /** 自定义注册表（测试/隔离场景用） */
  registry?: ComponentRegistry
}

export function createSparkPlugin(options?: SparkPluginOptions): Plugin {
  return {
    install(app: App) {
      // 默认使用全局 registry，确保 Spark.register() 注册的组件可被找到
      const registry = options?.registry ?? getGlobalRegistry()

      // 配置 DataView 使用 Vue shallowReactive 包装（仅追踪顶层属性，避免 rows 数据行的深度 Proxy 开销）
      DataView.wrapInstance = (dv) => shallowReactive(dv) as DataView

      // 创建应用级根能力上下文
      const rootContext: SparkCapabilityContext = {
        id: 'spark-root',
        type: 'spark-app',
        capabilities: new Map<CapabilityName, unknown>()
      }

      // 注入到 Vue DI（使用类型安全的 InjectionKey）
      app.provide(SPARK_REGISTRY_KEY, registry)
      app.provide(INTERNAL_PARENT_CAPABILITY_CONTEXT_KEY, rootContext)
    }
  }
}
