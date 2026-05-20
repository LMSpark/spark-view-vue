/**
 * @packageDocumentation
 *
 * 运行时协议总出口。
 *
 * 按消费者用途分组 re-export，作为 class-first runtime 契约面：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 模块注册契约    AiModuleRegistrationBase + 业务注册类型     │
 * │ 2. 会话事件协议    Session 生命周期、消息、函数调用历史类型    │
 * │ 3. 内部运行时协议  知识投射、函数调用翻译/执行、模块句柄类型   │
 * │ 4. 工具编解码      AiRuntimeToolCodec + 选项                  │
 * │ 5. 工具暴露策略    渐进式工具暴露函数 + 选项                  │
 * │ 6. 调用协议辅助    AiInvocationProtocol + 类型               │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 消费者指南：
 * - 应用层（App AI Center host）→ 使用第 1/2/4/5/6 组
 * - 业务模块实现者 → 使用第 1 组（AiModuleRegistrationBase）
 * - Runtime Core 内部 → 使用第 3 组
 * - 工具开发者 → 使用第 4/5/6 组
 */

// ═══════════════════════════════════════════════════════
// 1. 模块注册契约
// ═══════════════════════════════════════════════════════

/** 模块注册便捷基类，模块实现可继承它快速声明不可变 metadata */
export {
  AiModuleRegistrationBase,
} from './business-registration'

export type {
  /** 函数失败模式描述 */
  FunctionFailureMode,
  /** 函数注册信息 */
  AiFunctionRegistration,
  /** 模块注册树 */
  AiModuleRegistration,
  /** 模块实例参数声明 */
  AiModuleInstanceParam,
  /** 模块 prompt 提供者函数 */
  ModulePromptProvider,
  /** 模块 prompt 上下文 */
  ModulePromptContext,
} from './business-registration'

// ═══════════════════════════════════════════════════════
// 2. 会话事件协议
// ═══════════════════════════════════════════════════════

export type {
  /** 会话状态 */
  AiRuntimeSessionStatus,
  /** 会话生命周期快照 */
  AiRuntimeSessionLifecycleSnapshot,
  /** 消息角色 */
  AiRuntimeMessageRole,
  /** 消息来源 */
  AiRuntimeMessageSource,
  /** 函数调用历史状态 */
  AiRuntimeFunctionCallHistoryStatus,
  /** 历史条目基础类型 */
  AiRuntimeHistoryEntryBase,
  /** 会话记录 */
  AiRuntimeSessionRecord,
  /** 历史条目（联合类型） */
  AiRuntimeHistoryEntry,
  /** 消息历史条目 */
  AiRuntimeMessageHistoryEntry,
  /** 函数调用历史条目 */
  AiRuntimeFunctionCallHistoryEntry,
  /** 追加消息选项 */
  AiRuntimeAppendMessageOptions,
  /** 追加函数调用选项 */
  AiRuntimeAppendFunctionCallOptions,
  /** 记录函数调用请求选项 */
  AiRuntimeRecordFunctionCallRequestOptions,
  /** 完成函数调用选项 */
  AiRuntimeCompleteFunctionCallOptions,
  /** 启动会话选项 */
  AiRuntimeStartSessionOptions,
  /** 启动会话结果 */
  AiRuntimeStartSessionResult,
  /** 停止会话选项 */
  AiRuntimeStopSessionOptions,
  /** 停止会话结果 */
  AiRuntimeStopSessionResult,
} from './session-events'

// ═══════════════════════════════════════════════════════
// 3. Core 内部运行时协议
// ═══════════════════════════════════════════════════════

export type {
  // 作用域类型
  AiRuntimeInstanceScope,
  AiModuleInstanceBinding,
  AiRuntimeActivePathSnapshot,
  // 函数执行上下文
  FunctionExecutionContext,
  AiRuntimeFunctionContextParam,
  // 函数曝光
  AiRuntimeFunctionExposure,
  AiRuntimeModuleExposure,
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
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeFunctionResultMessage,
  // 运行时选项
  AiRuntimeProjectKnowledgeOptions,
  AiRuntimeOptions,
  // 模块句柄派生选项
  AiRegisteredModuleStartSessionOptions,
  AiRegisteredModuleStopSessionOptions,
  AiRegisteredModuleProjectKnowledgeOptions,
  AiRegisteredModuleAppendMessageOptions,
  AiRegisteredModuleAppendFunctionCallOptions,
  AiRegisteredModuleRecordFunctionCallRequestOptions,
  AiRegisteredModuleCompleteFunctionCallOptions,
  AiRegisteredModuleTranslateFunctionCallOptions,
  AiRegisteredModuleExecuteFunctionCallOptions,
} from './runtime-protocol'

// ═══════════════════════════════════════════════════════
// 4. 工具编解码（value 导出）
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
// 5. 工具暴露策略（value 导出）
// ═══════════════════════════════════════════════════════

/** 创建初始工具集（渐进式暴露） */
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
// 6. 调用协议辅助（value 导出）
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
