/**
 * Application Context
 * 应用级上下文管理
 */

import { inject, reactive } from 'vue'
import type { App } from 'vue'
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
    config: options.config || {},
    initializedAt: new Date().toISOString()
  })
}

/**
 * 提供应用上下文（在应用初始化时调用）
 */
export function provideAppContext(app: App, context: AppContext): void {
  // 不使用 readonly，因为会导致类型不兼容
  app.provide(APP_CONTEXT_KEY, context)
}

/**
 * 使用应用上下文（在组件中调用）
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
 */
export function useAppContextOptional(): AppContext | undefined {
  return inject(APP_CONTEXT_KEY)
}

/**
 * 检查用户是否有指定权限
 */
export function hasPermission(context: AppContext, permission: string): boolean {
  return context.user.permissions.includes(permission)
}

/**
 * 检查用户是否有任一权限
 */
export function hasAnyPermission(context: AppContext, permissions: string[]): boolean {
  return permissions.some(perm => context.user.permissions.includes(perm))
}

/**
 * 检查用户是否有所有权限
 */
export function hasAllPermissions(context: AppContext, permissions: string[]): boolean {
  return permissions.every(perm => context.user.permissions.includes(perm))
}

/**
 * 检查用户是否有指定角色
 */
export function hasRole(context: AppContext, role: string): boolean {
  return context.user.roles.includes(role)
}

/**
 * 检查用户是否有任一角色
 */
export function hasAnyRole(context: AppContext, roles: string[]): boolean {
  return roles.some(role => context.user.roles.includes(role))
}
