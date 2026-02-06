/**
 * Application Context
 * 应用级上下文管理
 */

import { inject, reactive } from 'vue'
import type { AppContext, UserInfo, TenantInfo, EnvironmentInfo } from '../types'
import { APP_CONTEXT_KEY } from '../constants'

/**
 * 创建应用上下文
 */
export function createAppContext(options: {
  user: UserInfo
  tenant: TenantInfo
  env: EnvironmentInfo
  config?: Record<string, unknown>
}): AppContext {
  return reactive({
    user: options.user,
    tenant: options.tenant,
    env: options.env,
    config: options.config ?? {},
    initializedAt: new Date().toISOString()
  })
}

/**
 * 使用应用上下文（在组件中调用）
 * 
 * @deprecated 推荐使用 useAppContext from '@spark-view/spark-app/composables'
 * @internal 主要供 SparkApp 命名空间使用
 */
export function useAppContext(): AppContext {
  const context = inject(APP_CONTEXT_KEY)
  
  if (!context) {
    throw new Error(
      'AppContext not found. Make sure SparkApp.bootstrap() was called before mounting the app.'
    )
  }
  
  return context
}

/**
 * 可选的应用上下文（不抛出错误）
 * 
 * @internal 仅供内部使用（如 router/guards.ts）
 * @deprecated 推荐使用 tryUseAppContext from '@spark-view/spark-app/composables'
 */
export function useAppContextOptional(): AppContext | undefined {
  return inject(APP_CONTEXT_KEY)
}

/**
 * 检查用户是否有指定权限
 * 
 * @internal 仅供内部使用
 * @deprecated 推荐使用 usePermissions() composable
 */
export function hasPermission(context: AppContext, permission: string): boolean {
  return context.user.permissions.includes(permission)
}

/**
 * 检查用户是否有任一权限
 * 
 * @internal 仅供内部使用（如 router/guards.ts）
 * @deprecated 推荐使用 usePermissions() composable
 */
export function hasAnyPermission(context: AppContext, permissions: string[]): boolean {
  return permissions.some(perm => context.user.permissions.includes(perm))
}

/**
 * 检查用户是否有所有权限
 * 
 * @internal 仅供内部使用
 * @deprecated 推荐使用 usePermissions() composable
 */
export function hasAllPermissions(context: AppContext, permissions: string[]): boolean {
  return permissions.every(perm => context.user.permissions.includes(perm))
}

/**
 * 检查用户是否有指定角色
 * 
 * @internal 仅供内部使用
 * @deprecated 推荐使用 usePermissions() composable
 */
export function hasRole(context: AppContext, role: string): boolean {
  return context.user.roles.includes(role)
}

/**
 * 检查用户是否有任一角色
 * 
 * @internal 仅供内部使用
 * @deprecated 推荐使用 usePermissions() composable
 */
export function hasAnyRole(context: AppContext, roles: string[]): boolean {
  return roles.some(role => context.user.roles.includes(role))
}
