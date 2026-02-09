// Logger utilities
export {
  Logger,
  createConsoleTransport,
  createHttpTransport,
  createMemoryTransport,
} from './logger'

// Types
export type { LogLevel, LoggerApi, Transport, LoggerContext } from './logger'

// HTTP Client
export {
  HttpClient,
  createHttpClient,
} from './http/HttpClient'
export type { IApiContext } from './http/HttpClient'

// 能力系统
export * from './capability/index.js'

// 能力符号（Symbol-based capability names）
export * from './capability-symbols.js'
export type { CapabilityKey } from './capability-symbols.js'

// 能力接口类型（集中定义）
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

// 基础数据类型和权限系统
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

export {
  INSTANCE_PERMISSION_FIELD,
  MODEL_PERMISSION_FIELD,
  FieldVisibility,
  ComponentLevel
} from './data-types'

// 权限系统实现（实现类）
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

export type {
  IFieldRenderConfig,
  IFieldRenderState,
  IFieldRenderHelper
} from './permission/index.js'
