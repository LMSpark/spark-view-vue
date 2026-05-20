/**
 * Core 运行时协议。
 *
 * 描述框架中立的 AI Core 表层类型：知识投射、函数调用翻译/执行、模块绑定 API。
 *
 * 类型分组（按函数调用翻译 → 执行的生命周期）：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. 作用域类型        AiRuntimeInstanceScope 等                │
 * │ 2. 函数曝光          AiRuntimeFunctionExposure 等             │
 * │ 3. 知识投射          AiRuntimeKnowledgeProjection             │
 * │ 4. 翻译阶段          AiRuntimeFunctionCallTranslation 等      │
 * │ 5. 执行阶段          AiRuntimeFunctionCallRunInput 等         │
 * │ 6. 结果类型          AiRuntimeFunctionCallResult / Failure    │
 * │ 7. 运行时选项        AiRuntimeOptions 等                      │
 * │ 8. 模块句柄派生选项   AiRegisteredModule*Options               │
 * └──────────────────────────────────────────────────────────────┘
 */

import type {
  AiFunctionRegistration,
  AiModuleInstanceParam,
  AiModuleRegistration,
  FunctionFailureMode,
} from './business-registration'
import type { LlmJsonObject, LlmParameterSchemaRoot } from './parameter-schema'
import type {
  AiRuntimeAppendFunctionCallOptions,
  AiRuntimeAppendMessageOptions,
  AiRuntimeCompleteFunctionCallOptions,
  AiRuntimeRecordFunctionCallRequestOptions,
  AiRuntimeStartSessionOptions,
  AiRuntimeStopSessionOptions,
} from './session-events'

// ═══════════════════════════════════════════════════════
// 1. 作用域类型
//
// 标识 AI 运行时的实例上下文，是大多数运行时方法的通用参数。
// ═══════════════════════════════════════════════════════

/** 运行时实例作用域，标识一个 AI 模块的运行上下文 */
export interface AiRuntimeInstanceScope {
  /** 模块标识符（对应业务注册的 moduleId） */
  readonly moduleId: string
  /** 模块实例标识符（对应该模块的具体实体 ID） */
  readonly moduleInstanceId: string
  /** 会话实例 ID */
  readonly instanceId: string
  /** AI 运行时实例 ID */
  readonly runtimeInstanceId: string
}

/** 模块实例绑定：描述 active path 中一个模块路径和其实例 ID 的映射 */
export interface AiModuleInstanceBinding {
  /** 模块路径（在注册树中的完整路径） */
  readonly modulePath: string
  /** 实例 ID */
  readonly instanceId: string
  /** 参数名（用于注入到函数调用参数中，可选） */
  readonly paramName?: string | undefined
}

/** Active path 快照：记录函数调用时的模块实例上下文 */
export interface AiRuntimeActivePathSnapshot {
  /** 根实例 ID */
  readonly instanceId: string
  /** 模块实例绑定列表 */
  readonly bindings: readonly AiModuleInstanceBinding[]
  /** 参数名到模块实例 ID 的映射 */
  readonly moduleInstances: Readonly<Record<string, string>>
}

// ═══════════════════════════════════════════════════════
// 2. 函数曝光
//
// 描述 LLM 可见的函数能力和模块结构，
// 由 AiRuntimeProjector 从注册树投影生成。
// ═══════════════════════════════════════════════════════

/** 函数执行上下文，包含调用时的完整模块实例信息 */
export interface FunctionExecutionContext extends AiRuntimeInstanceScope {
  /** 模块路径（在注册树中的完整路径） */
  readonly modulePath: string
  /** 模块 ID 层级数组 */
  readonly moduleIds: readonly string[]
  /** 函数标识符 */
  readonly functionId: string
  /** LLM 工具 action 字符串 */
  readonly action: string
  /** 参数名到模块实例 ID 的映射 */
  readonly moduleInstances: Readonly<Record<string, string>>
  /** Active path 快照 */
  readonly activePath: AiRuntimeActivePathSnapshot
}

/** 函数上下文参数：描述函数需要从模块实例上下文中注入的参数 */
export interface AiRuntimeFunctionContextParam {
  /** 模块路径 */
  readonly modulePath: string
  /** 模块标识符 */
  readonly moduleId: string
  /** 参数名（注入到函数参数 schema 中的字段名） */
  readonly paramName: string
  /** 参数描述 */
  readonly description: string
}

/** 函数曝光：LLM 可见的单个函数能力描述 */
export interface AiRuntimeFunctionExposure {
  /** LLM 工具 action 字符串，格式为 rootInstance/childInstance@module@actionName */
  readonly action: string
  /** 模块标识符 */
  readonly moduleId: string
  /** 模块路径 */
  readonly modulePath: string
  /** 模块 ID 层级数组 */
  readonly moduleIds: readonly string[]
  /** 函数描述，会展示给 LLM */
  readonly description: string
  /** 函数参数的 JSON Schema */
  readonly paramsSchema: LlmParameterSchemaRoot
  /** 返回值的 JSON Schema（可选） */
  readonly resultSchema?: LlmJsonObject | undefined
  /** 最大执行时间（毫秒，可选） */
  readonly maxExecutionMs?: number | undefined
  /** 使用规则列表，会展示给 LLM */
  readonly usageRules?: readonly string[] | undefined
  /** 失败模式列表，会展示给 LLM */
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  /** 上下文参数列表，描述需要从模块实例注入的参数 */
  readonly contextParams: readonly AiRuntimeFunctionContextParam[]
}

/** 模块曝光：LLM 可见的模块结构和其子模块/函数 */
export interface AiRuntimeModuleExposure {
  /** 模块标识符 */
  readonly moduleId: string
  /** 模块路径 */
  readonly modulePath: string
  /** 模块 ID 层级数组 */
  readonly moduleIds: readonly string[]
  /** 模块名称 */
  readonly name: string
  /** 模块描述 */
  readonly description: string
  /** 模块 prompt 文本（可选） */
  readonly prompt?: string | undefined
  /** 实例参数声明（可选） */
  readonly instanceParam?: AiModuleInstanceParam | undefined
  /** 该模块直接曝光的函数列表 */
  readonly functions: readonly AiRuntimeFunctionExposure[]
  /** 子模块列表 */
  readonly modules: readonly AiRuntimeModuleExposure[]
}

// ═══════════════════════════════════════════════════════
// 3. 知识投射
//
// 将模块注册信息投影为 LLM 可用的知识快照，
// 是函数调用翻译的前置数据源。
// ═══════════════════════════════════════════════════════

/** 知识投射快照：包含模块曝光树和可用函数列表 */
export interface AiRuntimeKnowledgeProjection {
  /** 投影所属的运行时作用域 */
  readonly scope: AiRuntimeInstanceScope
  /** 模块曝光树（可递归查询子模块） */
  readonly module: AiRuntimeModuleExposure
  /** 聚合后的 prompt 文本快照 */
  readonly promptSnapshot: string
  /** 扁平化的可用函数列表（LLM 可选用的全部工具） */
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
}

// ═══════════════════════════════════════════════════════
// 4. 翻译阶段
//
// 将 LLM 产生的 action 字符串翻译为可执行的翻译结果，
// 包括：匹配函数曝光、注入上下文参数、校验 schema。
// ═══════════════════════════════════════════════════════

/** 函数调用翻译结果：包含完整的执行上下文和曝光信息 */
export interface AiRuntimeFunctionCallTranslation {
  /** LLM 使用的 action 字符串 */
  readonly action: string
  /** LLM 传入的原始参数 */
  readonly rawArgs: unknown
  /** 注入上下文参数后的有效参数 */
  readonly effectiveArgs: Record<string, unknown>
  /** 传给函数执行器的参数（已移除上下文参数） */
  readonly executionArgs: unknown
  /** 函数执行上下文 */
  readonly context: FunctionExecutionContext
  /** 匹配的函数曝光 */
  readonly exposure: AiRuntimeFunctionExposure
  /** 所属的模块注册树 */
  readonly moduleRegistration: AiModuleRegistration
  /** 函数注册信息 */
  readonly functionRegistration: AiFunctionRegistration
}

/** 函数调用翻译结果（Result 类型） */
export type AiRuntimeFunctionCallTranslationResult = {
  readonly ok: true
  readonly translation: AiRuntimeFunctionCallTranslation
} | AiRuntimeFunctionCallFailure

// ═══════════════════════════════════════════════════════
// 5. 执行阶段
//
// 执行翻译后的函数调用，包括：调用方校验、运行、结果标准化。
// ═══════════════════════════════════════════════════════

/** 函数调用运行输入：传给调用方 run/validate/normalizeResult 的参数 */
export interface AiRuntimeFunctionCallRunInput {
  /** 翻译结果 */
  readonly translation: AiRuntimeFunctionCallTranslation
  /** 所属的模块注册树 */
  readonly moduleRegistration: AiModuleRegistration
  /** 函数注册信息 */
  readonly functionRegistration: AiFunctionRegistration
  /** 执行参数（已移除上下文参数） */
  readonly args: unknown
  /** 函数执行上下文 */
  readonly context: FunctionExecutionContext
}

/** 函数调用校验器：校验 runInput 中的参数，返回 null 表示通过 */
export interface AiRuntimeFunctionCallValidator {
  (input: AiRuntimeFunctionCallRunInput): string | null
}

/** 函数调用执行器：实际执行业务逻辑的函数 */
export interface AiRuntimeFunctionCallRunner {
  (input: AiRuntimeFunctionCallRunInput): unknown
}

/** 函数调用结果标准化：将原始返回值转为 AiRuntimeFunctionCallResult */
export interface AiRuntimeFunctionCallResultNormalizer {
  (value: unknown, input: AiRuntimeFunctionCallRunInput): AiRuntimeFunctionCallResult<unknown>
}

/** 投射知识的选项：仅需作用域即可 */
export interface AiRuntimeProjectKnowledgeOptions extends AiRuntimeInstanceScope {}

/** 翻译函数调用的选项：action、参数、activePath 和可选的知识投影 */
export interface AiRuntimeTranslateFunctionCallOptions extends AiRuntimeProjectKnowledgeOptions {
  /** LLM 使用的 action 字符串 */
  readonly action: string
  /** LLM 传入的参数 */
  readonly args: unknown
  /** 当前激活的模块实例路径（可选） */
  readonly activePath?: readonly AiModuleInstanceBinding[] | undefined
  /** 知识投影快照（可选，不传则自动投影） */
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

/** 执行函数调用的选项：在翻译选项基础上增加 run/validate/normalizeResult */
export interface AiRuntimeExecuteFunctionCallOptions extends AiRuntimeTranslateFunctionCallOptions {
  /** 实际执行业务逻辑的函数 */
  readonly run: AiRuntimeFunctionCallRunner
  /** 调用方校验函数（可选），在 run 之前执行 */
  readonly validate?: AiRuntimeFunctionCallValidator | undefined
  /** 结果标准化函数（可选），在 run 之后执行 */
  readonly normalizeResult?: AiRuntimeFunctionCallResultNormalizer | undefined
  /** 执行失败时的修复建议（可选） */
  readonly errorFix?: string | undefined
  /** 附加元数据（可选） */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 创建函数结果消息的选项 */
export interface AiRuntimeCreateFunctionResultMessageOptions {
  /** LLM 使用的 action 字符串 */
  readonly action: string
  /** 函数执行结果 */
  readonly result: AiRuntimeFunctionCallResult<unknown>
}

// ═══════════════════════════════════════════════════════
// 6. 函数调用结果
//
// 统一的结果类型，成功时 ok=true 携带 data，失败时 ok=false 携带错误信息。
// ═══════════════════════════════════════════════════════

/** 函数调用失败：包含错误码、消息和修复建议 */
export interface AiRuntimeFunctionCallFailure {
  readonly ok: false
  /** 错误码（如 INVALID_ACTION、MODULE_MISMATCH 等） */
  readonly code: string
  /** 错误描述 */
  readonly msg: string
  /** 修复建议 */
  readonly fix: string
}

/** 函数调用结果：成功时携带 data 和可选摘要，失败时返回 Failure */
export type AiRuntimeFunctionCallResult<TData> = {
  readonly ok: true
  readonly data?: TData | undefined
  readonly summary?: string | undefined
} | AiRuntimeFunctionCallFailure

/** 函数结果消息：用于追加到会话历史 */
export interface AiRuntimeFunctionResultMessage {
  /** LLM 使用的 action 字符串 */
  readonly action: string
  /** 函数执行结果 */
  readonly result: AiRuntimeFunctionCallResult<unknown>
  /** 序列化后的内容字符串（用于展示给用户或 LLM） */
  readonly content: string
}

// ═══════════════════════════════════════════════════════
// 7. 运行时选项
// ═══════════════════════════════════════════════════════

/** AI 运行时初始化选项 */
export interface AiRuntimeOptions {
  /** 自定义时间获取函数，用于测试中的时间控制（可选） */
  readonly now?: (() => number) | undefined
}

// ═══════════════════════════════════════════════════════
// 8. 模块句柄派生选项
//
// AiRegisteredModule 的方法选项，从 AiRuntime*Options 派生，
// 去掉 moduleId 字段（由模块句柄自身提供）。
// ═══════════════════════════════════════════════════════

/** 模块句柄启动会话的选项 */
export interface AiRegisteredModuleStartSessionOptions extends Omit<AiRuntimeStartSessionOptions, 'moduleId'> {}
/** 模块句柄停止会话的选项 */
export interface AiRegisteredModuleStopSessionOptions extends Omit<AiRuntimeStopSessionOptions, 'moduleId'> {}
/** 模块句柄投射知识的选项 */
export interface AiRegisteredModuleProjectKnowledgeOptions extends Omit<AiRuntimeProjectKnowledgeOptions, 'moduleId'> {}
/** 模块句柄追加消息的选项 */
export interface AiRegisteredModuleAppendMessageOptions extends Omit<AiRuntimeAppendMessageOptions, 'moduleId'> {}
/** 模块句柄追加函数调用的选项 */
export interface AiRegisteredModuleAppendFunctionCallOptions extends Omit<AiRuntimeAppendFunctionCallOptions, 'moduleId'> {}
/** 模块句柄记录函数调用请求的选项 */
export interface AiRegisteredModuleRecordFunctionCallRequestOptions extends Omit<AiRuntimeRecordFunctionCallRequestOptions, 'moduleId'> {}
/** 模块句柄完成函数调用的选项 */
export interface AiRegisteredModuleCompleteFunctionCallOptions extends Omit<AiRuntimeCompleteFunctionCallOptions, 'moduleId'> {}
/** 模块句柄翻译函数调用的选项 */
export interface AiRegisteredModuleTranslateFunctionCallOptions extends Omit<AiRuntimeTranslateFunctionCallOptions, 'moduleId'> {}
/** 模块句柄执行函数调用的选项 */
export interface AiRegisteredModuleExecuteFunctionCallOptions extends Omit<AiRuntimeExecuteFunctionCallOptions, 'moduleId'> {}
