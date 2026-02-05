// src/components/spark/index.ts

/**
 * SPARK 组件系统入口 - 组件注册中心
 * 所有组件都在这里注册，实现完全解耦
 */

import { Spark } from '@spark-view/spark-component'

// 导入所有SPARK组件
import SparkEJ2Grid from './ej2/SparkEJ2Grid.vue'
import SparkEJ2Column from './ej2/SparkEJ2Column.vue'
import SparkComponentRenderer from './SparkComponentRenderer.vue'

// 组件注册映射
const sparkComponents = {
  'spark-ej2-grid': SparkEJ2Grid,
  'spark-ej2-column': SparkEJ2Column,
  'spark-component-renderer': SparkComponentRenderer,
}

// 转换为组件定义数组
const sparkComponentDefinitions = Object.entries(sparkComponents).map(([type, component]) => ({
  type,
  name: type,
  version: '1.0.0',
  component
}))

/**
 * 初始化SPARK组件系统
 * 在应用启动时调用此函数注册所有组件
 */
export function initializeSparkComponents(): void {
  const logger = Spark.Logger()
  logger.info('🚀 Initializing SPARK Component System...')

  // 注册所有组件
  Spark.register(sparkComponentDefinitions)

  logger.info('✅ SPARK Component System initialized with components:', Object.keys(sparkComponents))
}

/**
 * 获取已注册的组件类型（用于调试）
 */
export function getRegisteredSparkComponents(): string[] {
  return Object.keys(sparkComponents)
}

// 导出组件（可选，用于直接使用）
export { SparkEJ2Grid, SparkEJ2Column }

// 导出渲染器
export { default as SparkComponentRenderer } from './SparkComponentRenderer.vue'