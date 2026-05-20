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

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.every((item): item is string => typeof item === 'string') ? value : undefined
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
  const { checkPermission } = options

  /** 解析 appContext：支持函数或静态值，保证登录后路由守卫可取到最新上下文 */
  const resolveContext = (): AppContext | undefined =>
    typeof getAppContext === 'function' ? getAppContext() : getAppContext

  // 全局前置守卫：页面级权限检查
  // 认证守卫由 main.ts beforeMount 中的自定义 beforeEach 负责（租户隔离逻辑）
  router.beforeEach((to, _from) => {
    // 公开页面跳过权限检查
    if (to.meta['public'] === true) {
      return true
    }

    // 页面级权限检查（仅当 meta.permissions 声明时生效）
    const requiredPermissions = readStringArray(to.meta['permissions'])
    if (!requiredPermissions?.length) return true

    const appContext = resolveContext()
    if (!appContext) return true  // 无上下文时放行，认证守卫另行处理

    const hasPermission = checkPermission
      ? checkPermission(appContext.user.permissions, requiredPermissions)
      : hasAnyPermission(appContext, requiredPermissions)

    if (!hasPermission) {
      routerLogger.warn('无权限访问', {
        path: to.path,
        required: requiredPermissions,
        userPermissions: appContext.user.permissions
      })
      return false
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

  routerLogger.info('路由守卫已设置', {
    hasPermissionChecker: checkPermission !== undefined,
  })
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
