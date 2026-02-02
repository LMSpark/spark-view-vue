/**
 * @spark-view/spark-app
 * SPARK Application Layer - 应用层基础设施
 */

// 符号常量表
export * from './constants'

// 核心命名空间
export { SparkApp } from './namespace'

// Logger
export {
  createAppLogger,
  createScopedLogger,
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
  BootstrapOptions,
  RouterGuardOptions,
  ErrorHandlerOptions,
  LogLevel,
  AppEnvironment
} from './types'

// AppContext
export {
  createAppContext,
  provideAppContext,
  useAppContext,
  useAppContextOptional,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  hasRole,
  hasAnyRole
} from './context/AppContext'

export { APP_CONTEXT_KEY } from './constants'

// Bootstrap
export { bootstrap } from './bootstrap'

// Router Guards
export { setupRouterGuards, setupLoadingGuard } from './router/guards'

// Error Handler
export { setupErrorHandler, createErrorBoundary } from './error/handler'

// Config
export { loadConfig, isFeatureEnabled } from './config'

// Environment Adapter (SSR/SPA兼容层)
export {
  envAdapter,
  getEnvironment,
  getBrowser,
  onClient,
  onServer,
  onBoth,
  EnvironmentType
} from './environment'

export type {
  IEnvironmentInfo,
  IBrowserAdapter,
  IEnvironmentDetector
} from './environment'

// Dependency Injection (依赖注入容器)
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
