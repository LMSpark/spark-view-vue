/**
 * @packageDocumentation
 *
 * 模块语义协议公共入口。
 *
 * 协议层导出:
 * - 操作结果对象
 * - 模块类型(ModuleKind / AttributeSchema / ActionSchema)
 * - 模块路径(ModulePath / 段类型)
 * - 路径上下文 + 实例引用类型
 */

// ═══════════════════════════════════════════════════════
// 1. 操作结果
// ═══════════════════════════════════════════════════════

export {
  errorCheck,
  fail,
  infoCheck,
  ok,
  warnCheck,
} from './operation-result'

export type {
  CheckEntry,
  CheckEntryLevel,
  OperationResult,
} from './operation-result'

// ═══════════════════════════════════════════════════════
// 2. 模块类型
// ═══════════════════════════════════════════════════════

export {
  ModuleKind,
} from './module-kind'

export type {
  ActionFailureMode,
  ActionSchema,
  AttributeAccessFlags,
  AttributeSchema,
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOptions,
  ModuleKindOperation,
  ModuleKindRunner,
  ModuleInstanceFinder,
  ModulePathContext,
} from './module-kind'

// ═══════════════════════════════════════════════════════
// 3. 模块路径
// ═══════════════════════════════════════════════════════

export {
  ModulePath,
  ModulePathParseError,
} from './module-path'

export type {
  ModulePathParseErrorCode,
  ModulePathSegment,
} from './module-path'

// ═══════════════════════════════════════════════════════
