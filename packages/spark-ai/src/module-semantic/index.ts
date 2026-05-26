/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/index.ts — 模块语义协议公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】按调用流程分块：
 *   1. 协议层值对象、运行上下文、元数据与请求 DTO
 *   2. ModuleSemanticRuntime（运行时组合根）
 *   3. 知识投影与固定协议工具规约
 *   4. 注册错误类型与 Host 工具编解码器
 *   5. 模块参数荷载 provider 注册表
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1. 协议层（值对象 / 上下文 / 元数据 / 请求 DTO）──────────────
export {
  ModuleCheckEntry,
  ModuleOperationResult,
} from './protocol/module-operation'

export {
  ModulePath,
  ModulePathParseError,
  ModulePathSegment,
} from './protocol/module-path'

export {
  ModuleKind,
} from './protocol/module-kind'

export type {
  ModuleCheckEntryLevel,
  ModuleOperationResultOptions,
} from './protocol/module-operation'

export type {
  ModuleFunctionFailureMode,
  ModuleFunctionMetadata,
  ModuleFunctionResultSchema,
  ModuleAttributeAccessor,
  ModuleAttributeAccess,
  ModuleAttributeMetadata,
  ModuleKindOptions,
  ModuleParameterPayloadMetadata,
} from './protocol/module-metadata'

export type {
  ModuleChildrenLister,
  ModuleHostContext,
  ModuleInstanceFinder,
  ModuleInstanceQuery,
  ModuleInstanceRef,
  ModuleKindOperation,
  ModuleKindRunner,
  ModulePathContext,
} from './protocol/module-context'

export type {
  ModulePathParseErrorCode,
} from './protocol/module-path'

export type {
  ModuleFindInstanceRequest,
  ModuleFunctionInvokeRequest,
  ModuleSetAttributeRequest,
} from './protocol/module-request'

// ── 2. 运行时 ─────────────────────────────────────────────────
export {
  ModuleSemanticRuntime,
} from './runtime/module-semantic-runtime'

export type {
  ProtocolToolArgs,
} from './runtime/module-semantic-runtime'

// ── 3. 知识投影类型 ─────────────────────────────────────────
export type {
  ModuleSemanticKnowledgeFunctionFilter,
  ModuleSemanticKnowledgeFunctionGuide,
  ModuleSemanticKnowledgeFunctionGuideInput,
  ModuleSemanticKnowledgeFunctionSummary,
  ModuleSemanticKnowledgeModuleFilter,
  ModuleSemanticKnowledgeModuleSummary,
  ModuleSemanticKnowledgeSnapshot,
} from './knowledge/module-semantic-knowledge'

// ── 4. 协议工具规约（类型 + 常量）─────────────────────────────
export {
  PROTOCOL_TOOL_NAMES,
} from './internal/protocol-tool-generator'

export type {
  ModuleSemanticToolSpec,
  ProtocolToolName,
} from './internal/protocol-tool-generator'

// ── 5. describeKind 返回类型 ──────────────────────────────────
export type {
  ModuleKindDescription,
} from './internal/navigator'

// ── 6. 注册错误类型（便于业务方 instanceof 判断）─────────────
export {
  ModuleKindConflictError,
  ModuleKindNotFoundError,
} from './internal/module-kind-registry'

// ── 7. Host 工具编解码器 ────────────────────────────────────
export {
  ModuleSemanticToolCodec,
} from './host/index'

// ── 8. 模块参数荷载 provider 注册表 ────────────────────────
export {
  ModuleParameterPayloadRegistry,
} from './payloads/module-parameter-payload-registry'

export type {
  ModuleParameterPayloadGuide,
  ModuleParameterPayloadProvider,
  ModuleParameterPayloadQueryFilter,
  ModuleParameterPayloadSummary,
} from './payloads/module-parameter-payload-registry'
