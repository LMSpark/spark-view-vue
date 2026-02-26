// features/spark-ej2/initialize.ts
// SPARK-EJ2 组件初始化

import { defineAsyncComponent } from 'vue'
import { Spark } from '@spark-view/spark-component'
import type { ComponentRegistry } from '@spark-view/spark-component'
import { Logger } from '@spark-view/spark-utils'

/**
 * 初始化 SPARK-EJ2 组件（懒加载模式）
 *
 * - 全局注册表（不传 registry）：使用 `Spark.register()`，内部已封装 `defineAsyncComponent`
 * - 自定义注册表（传入 registry）：显式包装 `defineAsyncComponent` 再写入
 *
 * @param registry - 可选的注册表实例，默认使用全局注册表
 */
export function initializeSparkEJ2Components(registry?: ComponentRegistry) {
  const log = Logger('SparkEJ2')
  log.info('🚀 Registering SPARK-EJ2 components (lazy)…')

  if (registry) {
    // 自定义注册表（测试/隔离场景）：显式 defineAsyncComponent 以保持类型正确
    registry.register(
      'spark-ej2-grid',
      defineAsyncComponent(() => import('./components/SparkEJ2Grid.vue'))
    )
    registry.register(
      'spark-ej2-column',
      defineAsyncComponent(() => import('./components/SparkEJ2Column.vue'))
    )
  } else {
    // 全局注册表：Spark.register 内部已透明封装 defineAsyncComponent
    Spark.register('spark-ej2-grid', () => import('./components/SparkEJ2Grid.vue'))
    Spark.register('spark-ej2-column', () => import('./components/SparkEJ2Column.vue'))
  }

  log.info('✅ SPARK-EJ2 components registered')
}
