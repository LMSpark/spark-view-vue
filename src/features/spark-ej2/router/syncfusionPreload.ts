/**
 * 路由级 Syncfusion 预加载配置
 * 
 * @module syncfusionRouterConfig
 * @description
 * 为使用 Syncfusion 组件的路由提供预加载配置，优化用户体验：
 * 
 * **使用场景**：
 * 1. 在路由 beforeEnter 钩子中预加载 Syncfusion
 * 2. 在路由组件的 setup 中按需加载 Syncfusion
 * 
 * **性能优化**：
 * - 路由跳转时提前加载，减少组件挂载等待时间
 * - 避免主入口加载，首屏性能提升 ~800 KB
 * 
 * @example
 * ```ts
 * // 在路由配置中使用
 * import { preloadSyncfusionForRoute } from '@/features/spark-ej2/router/syncfusionPreload'
 * 
 * const routes = [
 *   {
 *     path: '/users',
 *     component: () => import('@/views/Users.vue'),
 *     beforeEnter: preloadSyncfusionForRoute // 预加载 Syncfusion
 *   }
 * ]
 * ```
 * 
 * @author SPARK Team
 * @since 2.0.0
 */

import type { NavigationGuardNext, RouteLocationNormalized } from 'vue-router'
import { useSyncfusionLoader } from '../composables/useSyncfusionLoader'

/**
 * 路由导航守卫：预加载 Syncfusion
 * 
 * 在路由跳转时提前加载 EJ2 Grid，减少组件挂载时的等待时间
 * 
 * @param to - 目标路由
 * @param from - 来源路由
 * @param next - 导航守卫回调
 */
export function preloadSyncfusionForRoute(
  _to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  const { preloadEJ2Grid } = useSyncfusionLoader()
  
  // 异步预加载（不阻塞路由）
  preloadEJ2Grid()
  
  // 立即继续导航
  next()
}

/**
 * 批量配置需要预加载 Syncfusion 的路由
 * 
 * @param routeNames - 路由名称列表
 * @returns 路由配置对象
 * 
 * @example
 * ```ts
 * const routes = [
 *   {
 *     path: '/grid-demo',
 *     name: 'grid-demo',
 *     component: () => import('@/views/GridDemo.vue'),
 *     ...withSyncfusionPreload(['grid-demo', 'data-table'])
 *   }
 * ]
 * ```
 */
export function withSyncfusionPreload(routeNames: string[]) {
  return {
    meta: {
      useSyncfusion: true,
      preloadRoutes: routeNames
    },
    beforeEnter: preloadSyncfusionForRoute
  }
}

/**
 * 检查路由是否使用 Syncfusion
 * 
 * @param route - 路由对象
 * @returns 是否使用 Syncfusion
 */
export function routeUsesSyncfusion(route: RouteLocationNormalized): boolean {
  return route.meta?.['useSyncfusion'] === true
}
