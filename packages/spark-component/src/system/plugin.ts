/**
 * SPARK Vue 插件
 *
 * 职责：
 * - 创建并注入 Registry
 * - 保持 spark-data 框架无关；Vue 响应式适配由组件级 DataView 状态/事件桥处理
 */

import type { App, Plugin } from 'vue'
import type { ComponentRegistry } from '../core/types.js'
import { getGlobalRegistry } from './registry.js'
import { SPARK_REGISTRY_KEY } from './keys.js'

export interface SparkPluginOptions {
  /** 自定义注册表（测试/隔离场景用） */
  registry?: ComponentRegistry
}

export function createSparkPlugin(options?: SparkPluginOptions): Plugin {
  return {
    install(app: App) {
      // 默认使用全局 registry，确保 Spark.register() 注册的组件可被找到
      const registry = options?.registry ?? getGlobalRegistry()

      // Registry 通过 Vue DI 注入；业务能力上下文由 Spark runtime owner/pageRoot 锚点建树。
      app.provide(SPARK_REGISTRY_KEY, registry)
    }
  }
}
