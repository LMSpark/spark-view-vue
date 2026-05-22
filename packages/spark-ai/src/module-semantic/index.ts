/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/index.ts — 模块语义协议公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】按功能分块：
 *   1. 操作结果 / 模块路径 / 上下文 / 实例引用（从 protocol 层）
 *   2. ModuleKind class + namespace（协议核心）
 *   3. ModuleAttributeMetadata / ModuleActionMetadata（元数据类型）
 *   4. ModuleSemanticRuntime（运行时组合根）
 *   5. 协议工具规约（类型 + 常量）
 *   6. 错误类型（便于业务方 instanceof 判断）
 *   7. ModuleSemanticToolCodec（适配 Host transport）
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1-4. 协议层（re-export from ./protocol）───────────────────
export {
  ModuleCheckEntry,
  ModuleKind,
  ModuleOperationResult,
  ModulePath,
  ModulePathParseError,
  ModulePathSegment,
} from './protocol/index'

export type {
  ModuleActionFailureMode,
  ModuleActionMetadata,
  ModuleActionResultSchema,
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleCheckEntryLevel,
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOperation,
  ModuleKindOptions,
  ModuleKindRunner,
  ModuleOperationResultOptions,
  ModulePathContext,
  ModulePathParseErrorCode,
} from './protocol/index'

// ── 5. 运行时 ─────────────────────────────────────────────────
export {
  ModuleSemanticRuntime,
} from './runtime/module-semantic-runtime'

export type {
  ProtocolToolArgs,
} from './runtime/module-semantic-runtime'

// ── 6. 协议工具规约（类型 + 常量）─────────────────────────────
export {
  PROTOCOL_TOOL_NAMES,
} from './internal/protocol-tool-generator'

export type {
  ModuleSemanticToolSpec,
  ProtocolToolName,
} from './internal/protocol-tool-generator'

// ── 7. describeKind 返回类型 ──────────────────────────────────
export type {
  ModuleKindDescription,
} from './internal/navigator'

// ── 8. 注册错误类型（便于业务方 instanceof 判断）─────────────
export {
  ModuleKindConflictError,
  ModuleKindNotFoundError,
} from './internal/module-kind-registry'

// ── 9. Host 工具编解码器 ─────────────────────────────────────
export {
  ModuleSemanticToolCodec,
} from './host/index'
