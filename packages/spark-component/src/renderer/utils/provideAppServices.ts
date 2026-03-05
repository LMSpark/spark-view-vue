/**
 * 构造 APP_SERVICES 能力 payload 的工厂函数。
 *
 * 同时被 usePageRenderer 和 SparkPageRenderer 的 useRendererSetup 使用，避免重复构造相同对象。
 */

import type { Router } from 'vue-router'
import type { LoggerApi, IAppServicesCapability } from '@spark-view/spark-utils'

/**
 * 根据 vue-router 实例和 Logger 构建 APP_SERVICES payload。
 *
 * router 可选：在 Storybook / 测试等无路由环境下传入 null/undefined 时，
 * 降级为 noop stub，避免运行时崩溃。
 */
export function buildAppServices(
  router: Router | null | undefined,
  logger: LoggerApi
): IAppServicesCapability {
  const noop = () => Promise.resolve()
  return {
    router: router
      ? {
          push: (to) => router.push(to as Parameters<Router['push']>[0]),
          replace: (to) => router.replace(to as Parameters<Router['replace']>[0]),
          back: () => router.back(),
          currentRoute: router.currentRoute.value
        }
      : {
          push: noop,
          replace: noop,
          back: () => {},
          currentRoute: undefined
        },
    logger
  }
}
