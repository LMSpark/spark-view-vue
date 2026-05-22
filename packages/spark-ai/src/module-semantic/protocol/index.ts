/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/protocol/index.ts — 协议层公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】协议概念按文件拆分，统一从本入口导出。
 * ═══════════════════════════════════════════════════════════════
 */

export {
  ModuleKind,
} from './module-kind'

export type {
  ModuleActionFailureMode,
  ModuleActionMetadata,
  ModuleActionResultSchema,
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleKindOptions,
} from './module-kind'

export {
  ModuleCheckEntry,
  ModuleOperationResult,
} from './module-operation'

export type {
  ModuleCheckEntryLevel,
  ModuleOperationResultOptions,
} from './module-operation'

export {
  ModulePath,
  ModulePathParseError,
  ModulePathSegment,
} from './module-path'

export type {
  ModulePathParseErrorCode,
} from './module-path'

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
