/**
 * 构造 APP_SERVICES 能力 payload 的工厂函数。
 *
 * 同时被 usePageRenderer 和 useJsonRenderer 使用，避免重复构造相同对象。
 */

import type { Router } from 'vue-router'
import type { LoggerApi, IAppServicesCapability } from '@spark-view/spark-utils'

/**
 * 根据 vue-router 实例和 Logger 构建 APP_SERVICES payload。
 *
 * router 的 push/replace 已做最窄参数签名（与 IAppServicesCapability 对齐）；
 * logger 直接透传，无需再次包装。
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
      currentRoute: router.currentRoute.value
    },
    logger
  }
}
