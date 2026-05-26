/**
 * module-semantic · 协议层公共入口
 *
 * 本目录的稳定门面，按协议栈从底层到上层排列。
 *
 * 文件与依赖关系：
 *   1. module-path      — 路径值对象与解析错误
 *   2. module-operation — 操作结果与诊断条目
 *   3. module-context   — Host 上下文、实例引用与运行委托
 *   4. module-metadata  — ModuleKind 声明式元数据与构造选项
 *   5. module-request   — Runtime/API 边界请求 DTO
 *   6. module-kind      — 协议核心 class
 *
 * 公共 barrel 禁止 export *，新增协议符号必须在此显式登记。
 */

export {
  ModulePath,
  ModulePathParseError,
  ModulePathSegment,
} from './module-path'

export type {
  ModulePathParseErrorCode,
} from './module-path'

export {
  ModuleCheckEntry,
  ModuleOperationResult,
} from './module-operation'

export type {
  ModuleCheckEntryLevel,
  ModuleOperationResultOptions,
} from './module-operation'

export type {
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOperation,
  ModuleKindRunner,
  ModulePathContext,
} from './module-context'

export type {
  ModuleFunctionFailureMode,
  ModuleFunctionMetadata,
  ModuleFunctionResultSchema,
  ModuleAttributeAccessor,
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleKindOptions,
  ModuleParameterPayloadMetadata,
} from './module-metadata'

export type {
  ModuleFindInstanceRequest,
  ModuleFunctionInvokeRequest,
  ModuleSetAttributeRequest,
} from './module-request'

export {
  ModuleKind,
} from './module-kind'
