/**
 * SPARK Vue 插件
 *
 * 职责：
 * - 创建并注入 Registry
 * - 配置 DataView 运行时包装策略
 */

/**
 * SPARK Vue 插件
 *
 * 职责：
 * - 创建并注入 Registry
 * 
 * 注意：
 * - DataView 不再通过插件进行 shallowReactive 包装
 * - Vue 层的响应式适配改为组件级 useDataViewSnapshot() composable
 * - 这样 spark-data 保持框架无关，其他框架也能复用
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
