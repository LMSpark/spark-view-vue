// features/spark-ej2/initialize.ts
// SPARK-EJ2 组件初始化

import SparkEJ2Grid from './components/SparkEJ2Grid.vue'
import SparkEJ2Column from './components/SparkEJ2Column.vue'
import { Spark } from '@spark-view/spark-component'

/**
 * 初始化 SPARK-EJ2 组件
 * 将 EJ2 Grid 和 Column 组件注册到 SPARK 系统
 */
export function initializeSparkEJ2Components() {
  const registry = Spark._registry()
  const logger = Spark.Logger()
  logger.info('🚀 Registering SPARK-EJ2 components...')

  // 注册 SparkEJ2Grid
  registry.register('spark-ej2-grid', {
    type: 'spark-ej2-grid',
    name: 'SPARK EJ2 Grid',
    component: SparkEJ2Grid
  })

  // 注册 SparkEJ2Column
  registry.register('spark-ej2-column', {
    type: 'spark-ej2-column',
    name: 'SPARK EJ2 Column',
    component: SparkEJ2Column
  })

  logger.info('✅ SPARK-EJ2 components registered')
}
