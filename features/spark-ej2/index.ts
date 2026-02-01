// features/spark-ej2/index.ts
// SPARK-EJ2 统一导出文件

// ============ DataGrid 组件（SPARK 集成） ============
export { default as SparkEJ2Grid } from './components/SparkEJ2Grid.vue'
export { default as SparkEJ2Column } from './components/SparkEJ2Column.vue'

// ============ 类型定义 ============
export type { SparkEJ2GridConfig, SparkEJ2ColumnConfig } from './types'

// ============ 初始化函数 ============
export { initializeSparkEJ2Components } from './initialize'

// ============ 说明 ============
/**
 * SPARK-EJ2 统一模块
 * 
 * DataGrid 组件（集成 SPARK 能力系统）:
 *    - SparkEJ2Grid: EJ2 Grid 组件，支持能力系统、递归渲染
 *    - SparkEJ2Column: EJ2 Column 组件，支持嵌套列、能力消费
 * 
 * 使用方式：
 * ```ts
 * import { initializeSparkEJ2Components } from '@/features/spark-ej2'
 * 
 * // 初始化组件
 * await initializeSparkEJ2Components(manager)
 * ```
 */
