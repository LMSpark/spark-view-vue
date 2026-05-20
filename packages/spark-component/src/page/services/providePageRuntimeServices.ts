/**
 * 构造页面运行时服务能力 payload 的工厂函数。
 *
 * 被 SparkPageRenderer 的 useRendererSetup 使用，避免重复构造相同对象。
 */

import type { RouteLocationRaw, Router } from 'vue-router'
import type { PageRuntimeServicesCapability } from '@spark-view/spark-page-config/page/services'
import type { LoggerApi } from '@spark-view/spark-utils'

type AppRouteTarget = string | { path: string; query?: Record<string, unknown> }

function stringifyQueryParams(params: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query[key] = String(value)
    }
  }
  return query
}

function toRouteLocation(to: AppRouteTarget): RouteLocationRaw {
  if (typeof to === 'string') return to
  return {
    path: to.path,
    ...(to.query !== undefined ? { query: stringifyQueryParams(to.query) } : {}),
  }
}

/**
 * 根据 vue-router 实例和 Logger 构建页面运行时服务 payload。
 */
export function buildPageRuntimeServices(
  router: Router,
  logger: LoggerApi
): PageRuntimeServicesCapability {
  return {
    router: {
      push: (to) => router.push(toRouteLocation(to)),
      replace: (to) => router.replace(toRouteLocation(to)),
      back: () => router.back(),
      get currentRoute() { return router.currentRoute.value },
    },
    logger
  }
}
