/**
 * ═══════════════════════════════════════════════════════════════
 * modules/index.ts — 模块语义协议公共入口
 * ═══════════════════════════════════════════════════════════════
 *
 * 【导出策略】按调用流程分块：
 *   1. 协议层值对象、运行上下文、元数据与请求 DTO
 *   2. AiModuleRuntime（运行时组合根）
 *   3. 知识投影与 OpenAI function tool 规约
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
  appendAiModulePath,
  buildAiModulePath,
  parseAiModulePath,
} from './protocol/module-path'

export {
  AiModule,
} from './protocol/ai-module'

export type {
  AiModuleCheckLevel,
  AiModuleResultOptions,
} from './protocol/module-operation'

export type {
  AiModuleFunctionAntiExample,
  AiModuleFunctionExample,
  AiModuleFunctionFailureMode,
  AiModuleFunctionMetadata,
  AiModuleFunctionResultSchema,
  AiModuleAttributeAccessor,
  AiModuleAttributeAccess,
  AiModuleAttributeMetadata,
  AiModulePayloadMetadata,
  AiModuleOptions,
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
  AiModulePathSegmentInput,
} from './protocol/module-path'

export type {
  AiModuleFindInstanceRequest,
  AiModuleFunctionInvokeRequest,
  AiModuleSetAttributeRequest,
} from './protocol/module-request'

// ── 2. 运行时 ─────────────────────────────────────────────────
export {
  AiModuleRuntime,
} from './runtime/ai-module-runtime'

export {
  mergeCompanionChildDeclarations,
} from './runtime/companion-topology'

export type {
  ProtocolToolArgs,
} from './runtime/ai-module-runtime'

export type {
  AiModuleRuntimeInspectFinding,
  AiModuleRuntimeInspectLevel,
  AiModuleRuntimeInspectModule,
  AiModuleRuntimeInspectReport,
  AiModuleRuntimeInspectStatus,
} from './runtime/runtime-inspector'

export type {
  AiApiActionMetadata,
  AiApiConstructorMetadata,
  AiApiObjectMetadata,
  AiApiResultApiRef,
  AiModuleMetadataJson,
  ModuleMetadataRuntimeDocument,
} from './metadata'

export {
  AiApiObjectMetadataValidationError,
  validateApiObjectMetadata,
  resolveModuleMetadataJson,
  readModuleMetadataRuntimeDocument,
  toModuleFunctionResultApiMetadata,
} from './metadata'

// ── 2b. 参数荷载目录 ─────────────────────────────────────────
export {
  AiModulePayloadRegistry,
} from './payloads/module-parameter-payload-registry'

export { createPayloadCatalogModule } from './payloads/create-payload-catalog-module'

export type { CreatePayloadCatalogModuleOptions } from './payloads/create-payload-catalog-module'

export {
  PAYLOAD_GUIDE_FUNCTION_NAME,
  PAYLOAD_QUERY_FUNCTION_NAME,
} from './payloads/payload-catalog-constants'

export type {
  AiModulePayloadGuide,
  AiModulePayloadProvider,
  AiModulePayloadQueryFilter,
  AiModulePayloadSummary,
} from './payloads/module-parameter-payload-registry'

// ── 3. 知识投影类型 ─────────────────────────────────────────
export type {
  AiModuleKnowledgeAttributeDetailGuide,
  AiModuleKnowledgeFunctionGuide,
  AiModuleKnowledgeFunctionSummary,
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
