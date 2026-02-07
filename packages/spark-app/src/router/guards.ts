/**
 * Router Guards
 * 路由守卫（鉴权、权限检查、预加载）
 */

import type { Router } from 'vue-router'
import type { RouterGuardOptions, AppContext } from '../types'
import { createLogger } from '../logger'
import { inject } from 'vue'
import { APP_CONTEXT_KEY } from '../constants'

const routerLogger = createLogger('router')

/**
 * 检查用户是否拥有任一权限（内部辅助函数）
 */
function hasAnyPermission(context: AppContext, permissions: string[]): boolean {
  return permissions.some(perm => context.user.permissions.includes(perm))
}

/**
 * 设置路由守卫
 */
export function setupRouterGuards(
  router: Router,
  options: RouterGuardOptions = {}
): void {
  const {
    loginPath = '/login',
    forbiddenPath = '/forbidden',
    checkPermission
  } = options

  // 全局前置守卫
  router.beforeEach(async (to, _from, next) => {
    // 1. 检查 AppContext 是否已初始化
    const appContext = inject<AppContext | undefined>(APP_CONTEXT_KEY, undefined)
    
    // 登录页和公开页面跳过检查
    if (to.path === loginPath || to.meta.public === true) {
      return next()
    }

    // 未登录 - 重定向到登录页
    if (!appContext) {
      routerLogger.warn('未登录，重定向到登录页', { path: to.path })
      return next({ path: loginPath, query: { redirect: to.fullPath } })
    }

    // 2. 页面级权限检查
    const requiredPermissions = to.meta.permissions as string[] | undefined
    
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
        return next({ path: forbiddenPath })
      }
    }

    next()
  })

  // 全局后置守卫
  router.afterEach((to) => {
    // 更新页面标题
    if (to.meta.title && typeof document !== 'undefined') {
      document.title = `${to.meta.title} - SPARK`
    }
  })

  // 路由错误处理
  router.onError((error) => {
    routerLogger.error('路由错误', error)
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
