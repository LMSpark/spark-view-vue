/**
 * Router Guards
 * 路由守卫（鉴权、权限检查、预加载）
 */

import type { Router } from 'vue-router'
import type { RouterGuardOptions } from '../types'
import { useAppContextOptional, hasAnyPermission } from '../context/AppContext'

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
    enablePreload = false,
    checkPermission
  } = options

  // 全局前置守卫
  router.beforeEach(async (to, _from, next) => {
    // 1. 检查 AppContext 是否已初始化
    const appContext = useAppContextOptional()
    
    // 登录页和公开页面跳过检查
    if (to.path === loginPath || to.meta.public === true) {
      return next()
    }

    // 未登录 - 重定向到登录页
    if (!appContext) {
      console.warn('🔒 未登录，重定向到登录页', { path: to.path })
      return next({ path: loginPath, query: { redirect: to.fullPath } })
    }

    // 2. 页面级权限检查
    const requiredPermissions = to.meta.permissions as string[] | undefined
    
    if (requiredPermissions?.length) {
      const hasPermission = checkPermission
        ? checkPermission(appContext.user.permissions, requiredPermissions)
        : hasAnyPermission(appContext, requiredPermissions)

      if (!hasPermission) {
        console.warn('🚫 无权限访问', {
          path: to.path,
          required: requiredPermissions,
          userPermissions: appContext.user.permissions
        })
        return next({ path: forbiddenPath })
      }
    }

    // 3. 模型预加载（可选）
    if (enablePreload && to.meta.preloadModels) {
      try {
        const models = to.meta.preloadModels as string[]
        console.log('📦 预加载模型', models)
        // TODO: 调用 ModelRegistry 预加载
        // await modelRegistry.preload(models)
      } catch (error) {
        console.error('模型预加载失败', error)
        // 不阻塞路由跳转
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
    console.error('❌ 路由错误', error)
  })

  console.log('✅ 路由守卫已设置', options)
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
