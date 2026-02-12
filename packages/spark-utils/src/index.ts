/**
 * SPARK Utils - 共享工具库
 *
 * 提供日志、HTTP客户端、能力系统、权限系统等核心工具
 */

// ==================== 日志系统 ====================

/**
 * 日志工具
 * 提供结构化日志记录、传输器支持、多级别日志等功能
 */
export {
  Logger,
  createConsoleTransport,
  createHttpTransport,
  createMemoryTransport,
} from './logger'

/**
 * 日志相关类型定义
 */
export type { LogLevel, LoggerApi, Transport, LoggerContext } from './logger'


// ==================== 统一请求层 ====================

/**
 * 统一请求类
 * 基于拦截器模式的现代化请求层，支持重试、缓存、超时控制等
 */
export {
  Request,
  createRequest,
  getDefaultRequest,
  setDefaultRequest
} from './Request'
export type {
  HttpRequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
  RequestError,
  RequestResponse,
  ApiResponse
} from './Request'

/**
 * 预设拦截器库
 * 提供常用的请求/响应拦截器，如认证、租户、日志、错误处理等
 */
export {
  createAuthInterceptor,
  createTenantInterceptor,
  createRequestLogInterceptor,
  createTimestampInterceptor,
  createHeadersInterceptor,
  createStandardApiInterceptor,
  createResponseLogInterceptor,
  createErrorTransformInterceptor,
  createRedirectInterceptor,
  createRetryInterceptor
} from './RequestInterceptors'

// ==================== 文件加载器 ====================

/**
 * 文件加载器
 * 基于时间戳的智能缓存系统，支持自动降级和批量加载
 */
export {
  FileLoader,
  createFileLoader,
} from './FileLoader'
export type {
  FileLoadOptions,
  FileCache,
  FileLoadResult
} from './FileLoader'

// ==================== 能力系统 ====================

/**
 * 能力系统核心
 * 基于 Symbol 的依赖注入和能力提供/消费模式
 */
export * from './capability/index.js'

/**
 * 能力符号定义
 * Symbol-based capability names，用于类型安全的依赖注入
 */
export * from './capability-symbols.js'
export type { CapabilityKey } from './capability-symbols.js'

/**
 * 能力接口类型定义
 * 集中定义所有能力的接口类型
 */
export type {
  AppServicesCapability,
  AppRouterCapability,
  AppLoggerCapability,
  DataSourceCapability,
  DataSetStateCapability,
  IDataSetLike,
  IDataTableLike,
  GlobalDataCapability,
  PageServiceCapability,
  ApiClientCapability,
  FieldMetadataCapability,
  RowDataCapability,
  SelectionCapability,
  ValidationCapability,
  EventsCapability,
  GridEventsCapability,
  RowEventsCapability,
  GridInstanceCapability,
  ColumnManagerCapability,
  ColumnConfigCapability
} from './capability-types.js'

// ==================== 数据类型和权限系统 ====================

/**
 * 基础数据类型定义
 * 包括数据行、数据源、权限相关的类型定义
 */
export type {
  IDataRow,
  IDataRowWithPermission,
  IDataSource,
  IInstancePermission,
  IModelPermission,
  WithInstancePermission,
  WithModelPermission,
  IPermissionChecker,
  IPermissionFilter
} from './data-types'

/**
 * 权限相关常量和枚举
 */
export {
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel
} from './data-types'

// ==================== 权限系统实现 ====================

/**
 * 权限系统实现类
 * 提供权限检查、过滤、字段渲染等具体功能
 */
export {
  PermissionChecker,
  createPermissionChecker,
  checkPermission,
  PermissionFilter,
  createPermissionFilter,
  filterByPermission,
  FieldRenderHelper,
  createFieldRenderHelper,
  computeFieldState,
  computeFieldStates,
  filterVisibleFields
} from './permission/index.js'

/**
 * 权限系统相关类型定义
 */
export type {
  IFieldRenderConfig,
  IFieldRenderState,
  IFieldRenderHelper
} from './permission/index.js'
