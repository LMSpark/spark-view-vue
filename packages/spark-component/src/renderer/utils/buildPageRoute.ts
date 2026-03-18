/**
 * 页面路由工具
 *
 * 提供框架无关的路由快照构建和页面 ID 推断。
 * 被 SparkPageRenderer 调用。
 */

import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { IPageRoute } from '@spark-view/spark-page-config'

/**
 * 将 vue-router route 包装为框架无关的 IPageRoute
 *
 * 使用 getter 实时代理——route 是响应式的，脚本每次访问都拿到最新值。
 */
export function buildPageRoute(route: RouteLocationNormalizedLoaded): IPageRoute {
  return {
    get path()     { return route.path },
    get fullPath() { return route.fullPath },
    get name()     { return route.name ?? null },
    get params()   { return route.params as Record<string, string | string[]> },
    get query()    { return route.query as Record<string, string | string[] | null> },
    get hash()     { return route.hash },
  }
}

/**
 * 从 props / route 推断当前页面 ID
 *
 * 优先级：pageId → pageConfig.pageId → route.meta.pageId → route.params.id → route.name
 *
 * @throws Error 无法确定页面 ID 时抛出
 */
export function resolvePageId(
  route: RouteLocationNormalizedLoaded,
  pageId?: string,
  pageConfigPageId?: string,
): string {
  const id =
    pageId ??
    pageConfigPageId ??
    (route.meta['pageId'] as string | undefined) ??
    (route.params['id'] as string | undefined) ??
    (route.name as string | undefined)
  if (!id) throw new Error('配置无效: 无法确定页面ID')
  return id
}
