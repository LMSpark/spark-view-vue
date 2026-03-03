/**
 * Router Guards
 * 路由守卫（鉴权、权限检查、预加载）
 * 
 * 注意：路由守卫运行在 Vue setup 上下文之外，不能使用 inject()。
 * AppContext 通过函数参数传入。
 */

import type { Router } from 'vue-router'
import type { RouterGuardOptions, AppContext } from '../types'
import { createLogger } from '../logger'

const routerLogger = createLogger('router')

/**
 * 检查用户是否拥有任一权限（内部辅助函数）
 */
function hasAnyPermission(context: AppContext, permissions: string[]): boolean {
  return permissions.some(perm => context.user.permissions.includes(perm))
}

/**
 * 设置路由守卫
 * 
 * @param router - Vue Router 实例
 * @param options - 守卫配置
 * @param getAppContext - 应用上下文 getter（函数或静态值），用户登录后守卫能获取最新状态
 */
export function setupRouterGuards(
  router: Router,
  options: RouterGuardOptions = {},
  getAppContext?: AppContext | (() => AppContext | undefined)
): void {
  const {
    loginPath = '/login',
    forbiddenPath = '/forbidden',
    checkPermission
  } = options

  /** 解析 appContext：支持函数或静态值，保证登录后路由守卫可取到最新上下文 */
  const resolveContext = (): AppContext | undefined =>
    typeof getAppContext === 'function' ? getAppContext() : getAppContext

  // 全局前置守卫（返回值式）
  router.beforeEach((to, _from) => {
    // 登录页和公开页面跳过检查
    if (to.path === loginPath || to.meta['public'] === true) {
      return true
    }

    // 每次导航时解析最新的 appContext（支持登录后状态更新）
    const appContext = resolveContext()

    // 未登录 - 重定向到登录页
    if (!appContext) {
      routerLogger.warn('未登录，重定向到登录页', { path: to.path })
      return { path: loginPath, query: { redirect: to.fullPath } }
    }

    // 页面级权限检查
    const requiredPermissions = to.meta['permissions'] as string[] | undefined
    
    if (requiredPermissions?.length) {
      const hasPermission = checkPermission
        ? checkPermission(appContext.user.permissions, requiredPermissions)
        : hasAnyPermission(appContext, requiredPermissions)

      if (!hasPermission) {
        routerLogger.warn('无权限访问', {
          path: to.path,
          required: requiredPermissions,
          userPermissions: appContext.user.permissions
        })
        return { path: forbiddenPath }
      }
    }

    return true
  })

  // 全局后置守卫
  router.afterEach((to) => {
    // 更新页面标题
    const title = to.meta['title']
    if (title !== undefined && typeof document !== 'undefined') {
      document.title = `${String(title)} - SPARK`
    }
  })

  // 路由错误处理
  router.onError((error: unknown) => {
    const logError = error instanceof Error ? error : { error: String(error) }
    routerLogger.error('路由错误', logError)
  })

  routerLogger.info('路由守卫已设置', options as Record<string, unknown>)
}

/**
 * 添加加载状态守卫（可选）
 */
export function setupLoadingGuard(router: Router, showLoading: () => void, hideLoading: () => void): void {
  router.beforeEach(() => {
    showLoading()
  })

  router.afterEach(() => {
    hideLoading()
  })
}
