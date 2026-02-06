/**
 * @spark-view/spark-app
 * SPARK Application Layer - 应用层基础设施
 */

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

// HTTP 客户端已移至 @spark-view/spark-utils
// 请从 @spark-view/spark-utils 导入 createHttpClient 和 HttpClient
// IApiContext 也在 @spark-view/spark-utils 中

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
  BootstrapContext,  // 新增：Bootstrap 扩展 Context
  // BootstrapOptions,  // 已在上面导出
  RouterGuardOptions,
  ErrorHandlerOptions,
  LogLevel,
  AppEnvironment
} from './types'

// AppContext (向后兼容 - 内部使用)
// 注意：以下 API 主要供内部使用，推荐使用 Composables API
// - 推荐：useAppContext(), usePermissions() from './composables/useServices'
export {
  createAppContext  // SparkApp 命名空间需要
} from './context/AppContext'

export { APP_CONTEXT_KEY } from './constants'

// Router Guards
export { setupRouterGuards, setupLoadingGuard } from './router/guards'

// Error Handler
export { setupErrorHandler, createErrorBoundary } from './error/handler'

// Config
export { loadConfig, isFeatureEnabled } from './config'

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
