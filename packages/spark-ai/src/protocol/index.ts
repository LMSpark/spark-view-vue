/**
 * @packageDocumentation
 *
 * SPARK AI 运行时协议公共入口。
 *
 * 协议层拥有框架中立的公共接口面：模块注册契约、运行时/会话协议类型、
 * 工具调用编解码、参数校验、知识投影和运行时模块句柄。
 *
 * 导出分组（按消费者用途）：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 运行时协议类型     所有 runtime-contracts 导出的类型        │
 * │ 2. 注册基类          AiModuleRegistrationBase                 │
 * │ 3. 调用协议辅助      AiInvocationProtocol + 类型              │
 * │ 4. 工具编解码        AiRuntimeToolCodec + 选项                │
 * │ 5. 工具暴露策略      渐进式工具暴露函数 + 选项                 │
 * │ 6. 参数校验          LlmParamsValidator + 类型                │
 * │ 7. JSON Schema DSL   便捷构造器 + 类型                        │
 * │ 8. 知识投影          AiKnowledgeProjector / Catalog + 类型    │
 * │ 9. 运行时门面        AiRuntime / AiRegisteredModule           │
 * └──────────────────────────────────────────────────────────────┘
 */

// ═══════════════════════════════════════════════════════
// 1. 运行时协议类型（全部 runtime-contracts 类型）
// ═══════════════════════════════════════════════════════

export type {
  // 作用域 & 绑定
  AiRuntimeInstanceScope,
  AiModuleInstanceBinding,
  AiRuntimeActivePathSnapshot,
  // 函数曝光
  AiRuntimeFunctionContextParam,
  AiRuntimeFunctionExposure,
  AiRuntimeModuleExposure,
  FunctionExecutionContext,
  // 知识投射
  AiRuntimeKnowledgeProjection,
  // 翻译阶段
  AiRuntimeTranslateFunctionCallOptions,
  AiRuntimeFunctionCallTranslation,
  AiRuntimeFunctionCallTranslationResult,
  // 执行阶段
  AiRuntimeFunctionCallRunInput,
  AiRuntimeFunctionCallRunner,
  AiRuntimeFunctionCallValidator,
  AiRuntimeFunctionCallResultNormalizer,
  AiRuntimeExecuteFunctionCallOptions,
  // 结果类型
  AiRuntimeFunctionCallFailure,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionResultMessage,
  AiRuntimeCreateFunctionResultMessageOptions,
  // 会话 & 消息
  AiRuntimeSessionStatus,
  AiRuntimeSessionLifecycleSnapshot,
  AiRuntimeMessageRole,
  AiRuntimeMessageSource,
  AiRuntimeFunctionCallHistoryStatus,
  AiRuntimeHistoryEntryBase,
  AiRuntimeSessionRecord,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeFunctionCallHistoryEntry,
  // 会话操作选项
  AiRuntimeAppendMessageOptions,
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeStartSessionOptions,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionOptions,
  AiRuntimeStopSessionResult,
  // 运行时选项
  AiRuntimeOptions,
  AiRuntimeProjectKnowledgeOptions,
  // 模块句柄派生选项
  FunctionFailureMode,
  ModulePromptContext,
  ModulePromptProvider,
  // 模块/函数注册契约
  AiModuleRegistrationMetadata,
  AiModuleRegistration,
  AiModuleRegistrationBaseOptions,
  AiFunctionRegistration,
} from './runtime-contracts'

// ═══════════════════════════════════════════════════════
// 2. 注册基类
// ═══════════════════════════════════════════════════════

/** 模块注册便捷基类：模块实现可继承它快速声明不可变 metadata */
export {
  AiModuleRegistrationBase,
} from './runtime-contracts'

// ═══════════════════════════════════════════════════════
// 3. 调用协议辅助（value + 类型）
// ═══════════════════════════════════════════════════════

/** LLM 函数调用协议辅助工具：action 解析、结果序列化、JSON 提取 */
export {
  AiInvocationProtocol,
} from '../internal/invocation-helpers'

export type {
  /** action 路径拆解结果 */
  ActionPathParts,
  /** 归一化后的 token 统计 */
  TokenUsage,
} from '../internal/invocation-helpers'

// ═══════════════════════════════════════════════════════
// 4. 工具编解码（value + 类型）
// ═══════════════════════════════════════════════════════

/** AI Runtime 工具编解码器：将知识投影编码为 LLM tool specs */
export {
  AiRuntimeToolCodec,
} from '../internal/tool-codec'

export type {
  /** 工具编解码器选项 */
  AiRuntimeToolCodecOptions,
  /** LLM 工具规范 */
  AiRuntimeToolSpec,
} from '../internal/tool-codec'

// ═══════════════════════════════════════════════════════
// 5. 工具暴露策略（value + 类型）
// ═══════════════════════════════════════════════════════

/** 创建初始工具集（渐进式暴露：超过阈值时仅暴露 knowledge/lifecycle 模块） */
export {
  createInitialAiToolActionSet,
  /** 添加引导工具 action（LLM 调用 guideFunction 后解锁新工具） */
  addGuidedAiToolAction,
} from '../internal/tool-exposure-policy'

export type {
  /** 工具暴露策略选项 */
  AiRuntimeToolExposurePolicyOptions,
} from '../internal/tool-exposure-policy'

// ═══════════════════════════════════════════════════════
// 6. LLM 参数校验（value + 类型）
// ═══════════════════════════════════════════════════════

/** LLM 参数校验器：运行函数前对反序列化 JSON 参数做结构校验 */
export {
  LlmParamsValidator,
} from '../internal/llm-params-validator'

export type {
  /** 参数校验问题 */
  LlmParamValidationIssue,
  /** 参数校验结果 */
  LlmParamValidationResult,
} from '../internal/llm-params-validator'

// ═══════════════════════════════════════════════════════
// 7. JSON Schema DSL（便捷构造器 + 类型）
// ═══════════════════════════════════════════════════════

/** JSON Schema 便捷构造器：为函数参数 schema 提供统一 DSL */
export {
  anySchema,
  arraySchema,
  booleanSchema,
  enumSchema,
  noParamsSchema,
  numberSchema,
  objectSchema,
  paramsSchema,
  stringSchema,
} from '../internal/json-schema-helpers'

export type {
  /** JSON 对象属性快捷定义 */
  JsonSchemaProperties,
} from '../internal/json-schema-helpers'

export type {
  /** JSON Schema 类型定义 */
  LlmJsonObject,
  LlmJsonSchema,
  LlmJsonSchemaObject,
  LlmJsonSchemaType,
  LlmJsonValue,
  /** LLM 参数 schema 根节点 */
  LlmParameterSchemaRoot,
} from './parameter-schema'

// ═══════════════════════════════════════════════════════
// 8. 知识投影（value + 类型）
// ═══════════════════════════════════════════════════════

/** 知识投影统一窗口：为 LLM FC、后端 API 提供统一的知识查询入口 */
export {
  AiKnowledgeProjector,
} from '../internal/knowledge/knowledge-projection'

/** 知识工具目录：为 LLM 提供查询函数目录、参数、失败模式的表格接口 */
export {
  AiKnowledgeCatalog,
} from '../internal/knowledge/knowledge-tool-catalog'

export type {
  AiKnowledgeFunctionSummary,
  AiKnowledgeModuleSummary,
  AiKnowledgeScope,
} from '../internal/knowledge/knowledge-projection'

export type {
  AiKnowledgeCatalogRowOptions,
  AiKnowledgeFunctionFailureMode,
  AiKnowledgeFunctionId,
  AiKnowledgeFunctionParameterRow,
  AiKnowledgeFunctionTarget,
} from '../internal/knowledge/knowledge-tool-catalog'

// ═══════════════════════════════════════════════════════
// 9. 运行时门面
// ═══════════════════════════════════════════════════════

/** AI 运行时核心组合根：注册模块并返回模块绑定 API */
export {
  AiRuntime,
} from '../internal/runtime/ai-runtime'

/** 已注册模块句柄：接收生命周期通知，提供知识投影和函数调用翻译 */
export {
  AiRegisteredModule,
} from '../internal/runtime/ai-registered-module'
