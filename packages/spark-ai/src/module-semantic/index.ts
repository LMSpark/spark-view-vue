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
 *   6. 知识投影类型（旧 knowledge 体系在 6 工具协议上的当前映射）
 *   7. 错误类型（便于业务方 instanceof 判断）
 *   8. ModuleSemanticToolCodec（适配 Host transport）
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
} from './protocol-core-api'

export type {
  ModuleCheckEntryLevel,
} from './protocol-core-api'

export type {
  ModuleActionFailureMode,
  ModuleActionMetadata,
  ModuleActionResultSchema,
  ModuleKindOperation,
  ModuleKindRunner,
  ModuleOperationResultOptions,
} from './protocol-action-api'

export type {
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOptions,
  ModuleParameterPayloadMetadata,
} from './protocol-instance-api'

export type {
  ModulePathContext,
  ModulePathParseErrorCode,
} from './protocol-path-api'

// ── 5. 运行时 ─────────────────────────────────────────────────
export {
  ModuleSemanticRuntime,
} from './runtime/module-semantic-runtime'

export type {
  ProtocolToolArgs,
} from './runtime/module-semantic-runtime'

// ── 6. 知识投影类型 ─────────────────────────────────────────
export type {
  ModuleSemanticKnowledgeFunctionFilter,
  ModuleSemanticKnowledgeFunctionGuide,
  ModuleSemanticKnowledgeFunctionGuideInput,
  ModuleSemanticKnowledgeFunctionSummary,
  ModuleSemanticKnowledgeModuleSummary,
  ModuleSemanticKnowledgeSnapshot,
} from './knowledge/module-semantic-knowledge'

// ── 7. 协议工具规约（类型 + 常量）─────────────────────────────
export {
  PROTOCOL_TOOL_NAMES,
} from './internal/protocol-tool-generator'

export type {
  ModuleSemanticToolSpec,
  ProtocolToolName,
} from './internal/protocol-tool-generator'

// ── 8. describeKind 返回类型 ──────────────────────────────────
export type {
  ModuleKindDescription,
} from './internal/navigator'

// ── 9. 注册错误类型（便于业务方 instanceof 判断）─────────────
export {
  ModuleKindConflictError,
  ModuleKindNotFoundError,
} from './internal/module-kind-registry'

// ── 10. Host 工具编解码器 ────────────────────────────────────
export {
  ModuleSemanticToolCodec,
} from './host/index'

// ── 11. 模块参数荷载 provider 注册表 ────────────────────────
export {
  ModuleParameterPayloadRegistry,
} from './payloads/module-parameter-payload-registry'

export type {
  ModuleParameterPayloadGuide,
  ModuleParameterPayloadProvider,
  ModuleParameterPayloadQueryFilter,
  ModuleParameterPayloadSummary,
} from './payloads/module-parameter-payload-registry'
