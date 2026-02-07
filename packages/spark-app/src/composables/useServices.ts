/**
 * 服务访问 Composables
 * 
 * Vue 3 风格的服务访问接口，替代直接使用 DI 容器
 * 优势：
 * - 类型安全：TypeScript 完整支持
 * - 简洁明了：useXxx() 比 container.resolve() 更直观
 * - IDE 友好：自动完成、跳转定义
 * - Tree-shaking：未使用的 composables 可被移除
 */

import { inject } from 'vue'
import type { Router } from 'vue-router'
import type { AppContext } from '../types'
import type { IAuthService } from '../auth/types'
import {
  APP_CONTEXT_KEY,
  ROUTER_KEY,
  LOGGER_KEY,
  CONFIG_LOADER_KEY,
  SPARK_REGISTRY_KEY,
  AUTH_SERVICE_KEY
} from '../constants'

// Logger 类型（从实现中推断）
type Logger = ReturnType<typeof import('../logger').createLogger>

// 外部类型（从相应包导入）
type SparkRegistry = import('@spark-view/spark-component').ComponentRegistry
type ConfigLoader = import('@spark-view/spark-page-config').PageConfigLoader

// 导出 Injection Keys（向后兼容，推荐从 constants 导入）
export {
  APP_CONTEXT_KEY as AppContextKey,
  ROUTER_KEY as RouterKey,
  LOGGER_KEY as LoggerKey,
  CONFIG_LOADER_KEY as ConfigLoaderKey,
  SPARK_REGISTRY_KEY as SparkRegistryKey,
  AUTH_SERVICE_KEY as AuthServiceKey
}

// ============================================================================
// Composables（组合式函数）
// ============================================================================

/**
 * 使用应用上下文
 * 
 * @example
 * ```ts
 * const { user, tenant, env } = useAppContext()
 * console.log(user.username)
 * ```
 */
export function useAppContext(): AppContext {
  const context = inject(APP_CONTEXT_KEY)
  if (!context) {
    throw new Error('AppContext not provided. Make sure bootstrap() is called.')
  }
  return context
}

/**
 * 使用路由器
 * 
 * @example
 * ```ts
 * const router = useAppRouter()
 * router.push('/home')
 * ```
 */
export function useAppRouter(): Router {
  const router = inject(ROUTER_KEY)
  if (!router) {
    throw new Error('Router not provided.')
  }
  return router
}

/**
 * 使用日志器
 * 
 * @example
 * ```ts
 * const logger = useLogger()
 * logger.info('Component mounted')
 * ```
 */
export function useLogger(): Logger {
  const logger = inject(LOGGER_KEY)
  if (!logger) {
    throw new Error('Logger not provided.')
  }
  return logger
}

/**
 * 使用配置加载器
 * 
 * @example
 * ```ts
 * const configLoader = useConfigLoader()
 * const pageConfig = await configLoader.loadPageConfig('home')
 * ```
 */
export function useConfigLoader(): ConfigLoader {
  const loader = inject(CONFIG_LOADER_KEY)
  if (!loader) {
    throw new Error('ConfigLoader not provided.')
  }
  return loader
}

/**
 * 使用 SPARK 注册表
 * 
 * @example
 * ```ts
 * const registry = useSparkRegistry()
 * registry.register('my-component', MyComponent)
 * ```
 */
export function useSparkRegistry(): SparkRegistry {
  const registry = inject(SPARK_REGISTRY_KEY)
  if (!registry) {
    throw new Error('SparkRegistry not provided.')
  }
  return registry
}

/**
 * 使用认证服务
 * 
 * @example
 * ```ts
 * const auth = useAuth()
 * await auth.login({ username: 'admin', password: '123' })
 * if (auth.isAuthenticated()) {
 *   console.log('Logged in')
 * }
 * ```
 */
export function useAuth(): IAuthService {
  const auth = inject(AUTH_SERVICE_KEY)
  if (!auth) {
    throw new Error('AuthService not provided.')
  }
  return auth
}

// ============================================================================
// Optional Composables（可选服务，不抛出异常）
// ============================================================================

/**
 * 尝试使用应用上下文（不抛出异常）
 * 
 * @returns AppContext 或 undefined
 */
export function tryUseAppContext(): AppContext | undefined {
  return inject(APP_CONTEXT_KEY, undefined)
}

/**
 * 尝试使用认证服务（不抛出异常）
 * 
 * @returns AuthService 或 undefined
 */
export function tryUseAuth(): IAuthService | undefined {
  return inject(AUTH_SERVICE_KEY, undefined)
}

// ============================================================================
// 用户信息快捷访问
// ============================================================================

/**
 * 使用当前用户
 * 
 * @example
 * ```ts
 * const user = useCurrentUser()
 * console.log(user.username)
 * ```
 */
export function useCurrentUser() {
  const context = useAppContext()
  return context.user
}

/**
 * 使用当前租户
 * 
 * @example
 * ```ts
 * const tenant = useCurrentTenant()
 * console.log(tenant.tenantName)
 * ```
 */
export function useCurrentTenant() {
  const context = useAppContext()
  return context.tenant
}

/**
 * 使用环境信息
 * 
 * @example
 * ```ts
 * const env = useEnvironment()
 * if (env.isDevelopment) {
 *   console.log('Dev mode')
 * }
 * ```
 */
export function useEnvironment() {
  const context = useAppContext()
  return context.env
}

/**
 * 使用权限检查
 * 
 * @example
 * ```ts
 * const { hasPermission, hasRole } = usePermissions()
 * if (hasPermission('user:delete')) {
 *   // 显示删除按钮
 * }
 * ```
 */
export function usePermissions() {
  const user = useCurrentUser()
  
  return {
    hasPermission: (permission: string) => user.permissions.includes(permission),
    hasRole: (role: string) => user.roles.includes(role),
    hasAnyPermission: (...permissions: string[]) => 
      permissions.some(p => user.permissions.includes(p)),
    hasAllPermissions: (...permissions: string[]) => 
      permissions.every(p => user.permissions.includes(p))
  }
}
