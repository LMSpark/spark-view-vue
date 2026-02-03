/**
 * @spark-view/spark-app
 * SPARK Application Layer - 应用层基础设施
 */

// 环境适配器
export {
  createEnvironmentDetector,
  createBrowserAdapter,
  EnvironmentType
} from './environment'

export type {
  IEnvironmentInfo,
  IBrowserAdapter,
  IEnvironmentDetector
} from './environment'

// 符号常量表
export * from './constants'

// 核心命名空间
export { SparkApp } from './namespace'

// Start（高级 API - 推荐）
export { start } from './start'
export type { StartOptions, SparkOptions, PageConfigOptions } from './start'

// Bootstrap（中级 API）
export { bootstrap } from './bootstrap'
export type { BootstrapOptions } from './types'

// 认证模块
export {
  AuthService,
  authService,
  TokenManager
} from './auth'

export type {
  AuthConfig,
  LoginCredentials,
  AuthResult,
  TokenStorage,
  IAuthService
} from './auth'

// Logger
export {
  createAppLogger,
  createScopedLogger,
  createScopedLogger as createLogger, // Alias for convenience
  appLogger,
  pageLogger,
  apiLogger,
  routerLogger,
  createHttpTransport
} from './logger'

export type {
  AppLoggerConfig,
  LogTransport
} from './logger'

// 类型导出
export type {
  AppContext,
  AppConfig,
  UserInfo,
  TenantInfo,
  EnvironmentInfo,
  // BootstrapOptions,  // 已在上面导出
  RouterGuardOptions,
  ErrorHandlerOptions,
  LogLevel,
  AppEnvironment
} from './types'

// AppContext (旧版 composables - 向后兼容)
export {
  createAppContext,
  provideAppContext,
  useAppContextOptional,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole
} from './context/AppContext'

export { APP_CONTEXT_KEY } from './constants'

// Router Guards
export { setupRouterGuards, setupLoadingGuard } from './router/guards'

// Error Handler
export { setupErrorHandler, createErrorBoundary } from './error/handler'

// Config
export { loadConfig, isFeatureEnabled } from './config'

// Environment Adapter (SSR/SPA兼容层) - 已在上面导出
export {
  envAdapter,
  getEnvironment,
  getBrowser,
  onClient,
  onServer,
  onBoth
} from './environment'

// Dependency Injection (依赖注入容器 - 保留向后兼容，推荐使用 composables)
export {
  container,
  DependencyContainer,
  ServiceLifetime,
  ServiceIdentifiers
} from './di/container'

export type {
  IDependencyContainer,
  ServiceProvider,
  ServiceDescriptor
} from './di/container'

// Composables (推荐使用)
export {
  useAppContext,
  useAppRouter,
  useLogger,
  useConfigLoader,
  useSparkManager,
  useSparkRegistry,
  useAuth,
  tryUseAppContext,
  tryUseAuth,
  useCurrentUser,
  useCurrentTenant,
  useEnvironment,
  usePermissions,
  // Injection Keys
  AppContextKey,
  RouterKey,
  LoggerKey,
  ConfigLoaderKey,
  SparkManagerKey,
  SparkRegistryKey,
  AuthServiceKey
} from './composables/useServices'
