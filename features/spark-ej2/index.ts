// features/spark-ej2/index.ts
// SPARK-EJ2 统一导出文件

// ============ SPARK 集成组件 (推荐) ============
export { default as SparkEJ2Grid } from './components/spark/SparkEJ2Grid.vue'
export { default as SparkEJ2Column } from './components/spark/SparkEJ2Column.vue'

// ============ 基础 EJ2 包装组件 ============
export { default as GridComponent } from './components/basic/GridComponent.vue'
export { default as ColumnComponent } from './components/basic/ColumnComponent.vue'

// ============ 类型定义 ============
export type { SparkEJ2GridConfig, SparkEJ2ColumnConfig } from './types'

// ============ 初始化函数 ============
export { initializeSparkEJ2Components } from './initialize'

// ============ 说明 ============
/**
 * SPARK-EJ2 统一模块
 * 
 * 包含两类组件：
 * 
 * 1. SPARK 集成组件（推荐）:
 *    - SparkEJ2Grid: 集成 SPARK 能力系统的 Grid
 *    - SparkEJ2Column: 集成 SPARK 能力系统的 Column
 * 
 * 2. 基础 EJ2 包装组件:
 *    - GridComponent: 基础 EJ2 Grid 包装
 *    - ColumnComponent: 基础 EJ2 Column 包装
 * 
 * 使用方式：
 * ```ts
 * import { initializeSparkEJ2Components } from '@/features/spark-ej2'
 * 
 * // 初始化组件
 * await initializeSparkEJ2Components(manager)
 * ```
 */
