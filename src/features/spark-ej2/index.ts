// features/spark-ej2/index.ts
// SPARK-EJ2 统一导出文件

// ============ DataGrid 组件（SPARK 集成） ============
export { default as SparkEJ2Grid } from './components/SparkEJ2Grid.vue'
export { default as SparkEJ2Column } from './components/SparkEJ2Column.vue'

// ============ 类型定义 ============
export type { SparkEJ2GridConfig, SparkEJ2ColumnConfig } from './types'

// ============ 初始化函数 ============
export { initializeSparkEJ2Components } from './initialize'

// ============ 动态加载器（路由级懒加载优化） ============
export { useSyncfusionLoader } from './composables/useSyncfusionLoader'
export { 
  preloadSyncfusionForRoute, 
  withSyncfusionPreload, 
  routeUsesSyncfusion 
} from './router/syncfusionPreload'

// ============ 说明 ============
/**
 * SPARK-EJ2 统一模块
 * 
 * DataGrid 组件（集成 SPARK 能力系统）:
 *    - SparkEJ2Grid: EJ2 Grid 组件，支持能力系统、递归渲染
 *    - SparkEJ2Column: EJ2 Column 组件，支持嵌套列、能力消费
 * 
 * 动态加载器（性能优化）:
 *    - useSyncfusionLoader: Composable，按需加载 Syncfusion
 *    - preloadSyncfusionForRoute: 路由守卫，预加载 Syncfusion
 *    - withSyncfusionPreload: 路由配置辅助函数
 * 
 * 使用方式：
 * ```ts
 * // 1. 初始化组件（注册到 SPARK）
 * import { initializeSparkEJ2Components } from '@/features/spark-ej2'
 * await initializeSparkEJ2Components(manager)
 * 
 * // 2. 路由级预加载（可选优化）
 * import { preloadSyncfusionForRoute } from '@/features/spark-ej2'
 * const routes = [
 *   {
 *     path: '/users',
 *     component: () => import('@/views/Users.vue'),
 *     beforeEnter: preloadSyncfusionForRoute
 *   }
 * ]
 * ```
 * 
 * **性能优化**：
 * - 主入口不加载 Syncfusion（首屏减少 ~800 KB gzipped）
 * - 路由级按需加载（使用时才加载）
 * - 可选预加载（路由跳转时提前加载）
 */
