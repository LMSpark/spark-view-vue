/**
 * 构造页面运行时服务能力 payload 的工厂函数。
 *
 * 被 SparkPageRenderer 的 useRendererSetup 使用，避免重复构造相同对象。
 */

import type { RouteLocationRaw, Router } from 'vue-router'
import type { PageRuntimeServicesCapability } from '../../runtime'
import type { LoggerApi } from '@spark-view/spark-utils'

type AppRouteObjectTarget = {
  path: string
  query?: Record<string, unknown>}

/**
 * 将业务侧传入的 query 值归一为 vue-router 可接受的字符串 query。
 *
 * undefined/null 表示不参与路由参数；其他值统一转字符串，避免把对象或数字直接
 * 交给 router 后出现序列化差异。
 */
function stringifyQueryParams(params: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query[key] = String(value)
    }
  }
  return query
}

/**
 * 将页面运行时的轻量跳转参数转换为 vue-router 原生 RouteLocationRaw。
 *
 * 支持两条路径：
 * 1. 直接字符串：交给 router 解析完整路径。
 * 2. path + query 对象：先清洗 query，再构造标准路由位置对象。
 */
function toRouteLocation(to: string | AppRouteObjectTarget): RouteLocationRaw {
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

