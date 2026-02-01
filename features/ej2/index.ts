// features/ej2/index.ts
// ⚠️ DEPRECATED: 使用 features/spark-ej2 代替
// EJ2组件系统入口文件

// ⚠️ DEPRECATED: 从 features/spark-ej2 导入 SPARK 集成组件
// 迁移指南：
// 旧代码: import { GridComponent } from './features/ej2'
// 新代码: import { SparkEJ2Grid } from './features/spark-ej2'
export { SparkEJ2Grid, SparkEJ2Column } from '../spark-ej2'

/**
 * 向后兼容说明：
 * 
 * features/ej2/ 已被整合到 features/spark-ej2/ 中
 * 
 * 新的统一结构：
 * - features/spark-ej2/components/spark/  - SPARK 集成组件（推荐）
 * - features/spark-ej2/components/basic/  - 基础 EJ2 包装组件
 * 
 * 请更新您的导入语句：
 * 
 * ```typescript
 * // ❌ 旧导入（已弃用）
 * import { GridComponent, ColumnComponent } from './features/ej2'
 * 
 * // ✅ 新导入
 * import { GridComponent, ColumnComponent } from './features/spark-ej2'
 * 
 * // 或使用 SPARK 集成版本
 * import { SparkEJ2Grid, SparkEJ2Column } from './features/spark-ej2'
 * ```
 */