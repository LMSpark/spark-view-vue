// features/spark-ej2/initialize.ts
// SPARK-EJ2 组件初始化

import SparkEJ2Grid from './components/SparkEJ2Grid.vue'
import SparkEJ2Column from './components/SparkEJ2Column.vue'
import { Spark } from '@spark-view/spark-component'
import type { ComponentRegistry } from '@spark-view/spark-component'

/**
 * 初始化 SPARK-EJ2 组件
 * 将 EJ2 Grid 和 Column 组件注册到 SPARK 系统
 *
 * @param registry - 可选的注册表实例，默认使用全局注册表
 */
export function initializeSparkEJ2Components(registry?: ComponentRegistry) {
  const reg = registry ?? Spark.getRegistry()
  const logger = Spark.Logger()
  logger.info('🚀 Registering SPARK-EJ2 components...')

  reg.register('spark-ej2-grid', SparkEJ2Grid)
  reg.register('spark-ej2-column', SparkEJ2Column)

  logger.info('✅ SPARK-EJ2 components registered')
}
