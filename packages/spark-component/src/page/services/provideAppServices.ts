/**
 * 构造 APP_SERVICES 能力 payload 的工厂函数。
 *
 * 被 SparkPageRenderer 的 useRendererSetup 使用，避免重复构造相同对象。
 */

import type { Router } from 'vue-router'
import type { IAppServicesCapability } from '../../core/capability-system.js'
import type { LoggerApi } from '@spark-view/spark-utils'

/**
 * 根据 vue-router 实例和 Logger 构建 APP_SERVICES payload。
 */
export function buildAppServices(
  router: Router,
  logger: LoggerApi
): IAppServicesCapability {
  return {
    router: {
      push: (to) => router.push(to as Parameters<Router['push']>[0]),
      replace: (to) => router.replace(to as Parameters<Router['replace']>[0]),
      back: () => router.back(),
      get currentRoute() { return router.currentRoute.value },
    },
    logger
  }
}
