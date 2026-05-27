/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/index.ts — 模块语义协议公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】按调用流程分块：
 *   1. 协议层值对象、运行上下文、元数据与请求 DTO
 *   2. AiModuleRuntime（运行时组合根）
 *   3. 知识投影与 OpenAI function tool 规约
 *   4. 模块参数荷载 provider 注册表
 * ═══════════════════════════════════════════════════════════════
 */

// ── 1. 协议层（值对象 / 上下文 / 元数据 / 请求 DTO）──────────────
export {
  AiModuleCheck,
  AiModuleResult,
} from './protocol/module-operation'

export {
  AiModulePath,
  AiModulePathParseError,
  AiModulePathSegment,
} from './protocol/module-path'

export {
  AiModule,
} from './protocol/module-kind'

export type {
  AiModuleCheckLevel,
  AiModuleResultOptions,
} from './protocol/module-operation'

export type {
  AiModuleFunctionFailureMode,
  AiModuleFunctionMetadata,
  AiModuleFunctionResultSchema,
  AiModuleAttributeAccessor,
  AiModuleAttributeAccess,
  AiModuleAttributeMetadata,
  AiModuleOptions,
  AiModulePayloadMetadata,
} from './protocol/module-metadata'

export type {
  AiModuleChildrenLister,
  AiModuleHostContext,
  AiModuleInstanceFinder,
  AiModuleInstanceQuery,
  AiModuleInstanceRef,
  AiModuleOperation,
  AiModuleRunner,
  AiModulePathContext,
} from './protocol/module-context'

export type {
  AiModulePathParseErrorCode,
} from './protocol/module-path'

export type {
  AiModuleFindInstanceRequest,
  AiModuleFunctionInvokeRequest,
  AiModuleSetAttributeRequest,
} from './protocol/module-request'

// ── 2. 运行时 ─────────────────────────────────────────────────
export {
  AiModuleRuntime,
} from './runtime/module-semantic-runtime'

export type {
  ProtocolToolArgs,
} from './runtime/module-semantic-runtime'

// ── 3. 知识投影类型 ─────────────────────────────────────────
export type {
  AiModuleKnowledgeFunctionFilter,
  AiModuleKnowledgeFunctionGuide,
  AiModuleKnowledgeFunctionGuideInput,
  AiModuleKnowledgeFunctionSummary,
  AiModuleKnowledgeModuleFilter,
  AiModuleKnowledgeModuleSummary,
  AiModuleKnowledgeSnapshot,
} from './knowledge/knowledge-types'

// ── 4. OpenAI function tool 规约类型 ───────────────────────
export type {
  AiModuleToolSpec,
} from './internal/protocol-tool-generator'

// ── 5. describeKind 返回类型 ──────────────────────────────────
export type {
  AiModuleDescription,
} from './internal/navigator'

// ── 6. 模块参数荷载 provider 注册表 ────────────────────────
export {
  AiModulePayloadRegistry,
} from './payloads/module-parameter-payload-registry'

export type {
  AiModulePayloadGuide,
  AiModulePayloadProvider,
  AiModulePayloadQueryFilter,
  AiModulePayloadSummary,
} from './payloads/module-parameter-payload-registry'
