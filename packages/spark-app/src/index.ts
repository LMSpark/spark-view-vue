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

// 插件管理系统
export {
  PluginRegistry,
  PluginManager,
  createPluginRegister,
  createPluginRegistry,
  getGlobalPluginRegistry,
  registerBuiltinPlugins,
  registerAllPresetPlugins
} from './plugins'

export type {
  IPluginRegistry,
  PluginConfigItem,
  PluginConfig,
  PluginLoader,
  PluginInstance
} from './plugins'

// 认证模块
export {
  AuthService,
  authService,
  TokenManager
} from './auth'

// HttpClient 已废弃，请使用 Request 类
// 从 @spark-view/spark-utils 导入 createRequest
// IApiContext 现在在 @spark-view/spark-data 中

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

// AppContext (内部使用)
export {
  createAppContext  // SparkApp 命名空间需要
} from './context/AppContext'

// Router Guards
export { setupRouterGuards, setupLoadingGuard } from './router/guards'

// Error Handler
export { setupErrorHandler, createErrorBoundary } from './error/handler'

// Config
export { loadConfig, isFeatureEnabled } from './config'

// 运行时组件注册辅助（可选，经典模式使用）
export { setupAutoRegister } from './auto-register'
export type { AutoRegisterOptions } from './auto-register'

// Composables
// ⚠️ DI 架构已统一到 SPARK 能力系统（管道 B）
// - 推荐：使用 consume(APP_SERVICES) 获取应用服务
// - Router：直接使用 vue-router 的 useRouter()
// - Logger：使用 Logger('module') 工厂函数
export {
  useSparkRegistry
} from './composables/useServices'
