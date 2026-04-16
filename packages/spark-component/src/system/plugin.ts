/**
 * SPARK Vue 插件
 *
 * 职责：
 * - 创建并注入 Registry
 * - 创建根 Spark 能力上下文
 * - 将根上下文绑定到 app runtime，而不是通过 Vue provide 传递
 */

import type { App, Plugin } from 'vue'
import { shallowReactive } from 'vue'
import type { ComponentRegistry } from '../core/types.js'
import { createSparkCapabilityContext } from '../core/capability-system.js'
import { bindAppRootCapabilityContext } from '../internal/capability-context.js'
import { getGlobalRegistry } from './registry.js'
import { SPARK_REGISTRY_KEY } from './keys.js'
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
      const rootContext = createSparkCapabilityContext({ id: 'spark-root', type: 'spark-app' })

      // Registry 仍通过 Vue DI 注入；SparkContext 自己通过 runtime 锚点表建树。
      app.provide(SPARK_REGISTRY_KEY, registry)
      bindAppRootCapabilityContext(app, rootContext)
    }
  }
}
