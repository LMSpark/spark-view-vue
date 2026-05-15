import type { ParameterPayloadProvider } from './parameter-payload-contracts'
import type { LlmJsonObject, LlmParameterSchemaRoot } from './parameter-schema'

/**
 * AI Core 运行时协议总览。
 *
 * 核心层定义递归模块知识、LLM 可见函数暴露、AI 会话记录、
 * LLM 函数调用翻译结果、执行翻译链路，以及把注册方执行结果转换成 LLM 可消费消息的最薄协议。
 * `startSession` / `stopSession` 与 AI 会话生命周期一致：core 会统一保存
 * AI 会话状态和历史记录，但不会创建、停止或释放任何模块服务实例。
 *
 * 边界约束：
 * - core 不创建、恢复、暂停、销毁模块服务实例。
 * - core 保存 AI 会话状态、UI/LLM 消息和 LLM 函数调用历史。
 * - core 不保存模块运行状态，也不维护 active path 状态。
 * - core 可调用调用方提供的函数落点，负责记录 requested/completed/failed。
 * - core 不拥有函数实现，不读取执行结果做编排、重试、轮次推进。
 * - core 不校验函数执行结果；结果只会被原样序列化后回传给 LLM。
 * - 模块服务生命周期、运行状态和函数落点绑定由注册方或会话宿主管理。
 *
 * 语义主链路：
 * A 模块实例 -> C 模块注册 -> B core 会话管理 -> LLM 函数编排
 * -> B core 记录/翻译/调用落点/回传 -> A 模块实例服务。
 *
 * 因此，B 是 AI core 的中心：它拥有 AI 会话轨迹，却不拥有 A 的运行状态。
 */

// =========================================================
// 一、基础 ID 与 action 路径
// =========================================================

/** 顶层或子模块 ID。ID 是路径段，不能包含 `/` 或 `@`。 */
export type AiRuntimeModuleId = string

/** 注册方/宿主管理的模块实例 ID，通常对应当前 AI 会话绑定的领域实例。 */
export type AiRuntimeModuleInstanceId = string

/** 递归模块路径，例如 `department/personnel/basicInfo`。 */
export type AiRuntimeModulePath = string

/** 模块下的函数 ID。ID 是路径段，不能包含 `/` 或 `@`。 */
export type AiRuntimeFunctionId = string

/** LLM 调用函数时使用的完整路径地址，例如 `rootId/childId@basicInfo@actionName`；实例路径段按 URI 编码。 */
export type AiRuntimeAction = string

// =========================================================
// 二、调用方拥有的会话与模块实例上下文
// =========================================================

/** 一次 AI 会话绑定到某个顶层模块实例时，调用方传给 core 的上下文。 */
export interface AiRuntimeInstanceScope {
  /** 顶层模块 ID，例如 `workspace`。 */
  readonly moduleId: AiRuntimeModuleId
  /** 顶层模块实例 ID，由注册方/宿主维护，例如文档 ID、工单 ID 或任务 ID。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  /** AI 会话技术 envelope ID；只做兼容标识，不参与会话隔离。 */
  readonly instanceId: string
  /** 通常与 instanceId 同义，供注册方执行上下文使用更明确的名字。 */
  readonly runtimeInstanceId: string
}

/** 只按顶层模块与模块实例定位的轻量 scope。 */
export interface AiRuntimeModuleInstanceScope {
  /** 顶层模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 顶层模块实例 ID。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
}

/** AI 会话生命周期状态。它描述 core 管理的 AI 会话，不描述模块服务实例。 */
export type AiRuntimeSessionStatus = 'Started' | 'Stopped'

/** AI 会话生命周期快照；由 start/stop 立即返回，并同步写入 core 会话记录。 */
export interface AiRuntimeSessionLifecycleSnapshot extends AiRuntimeInstanceScope {
  /** 本次通知的会话状态。 */
  readonly status: AiRuntimeSessionStatus
  /** 本次通知产生时间；由 `AiRuntimeOptions.now` 提供或使用 Date.now。 */
  readonly updatedAt?: number | undefined
  /** 调用方给出的启动/停止原因，仅用于上层记录和展示。 */
  readonly reason?: string | undefined
}

/** 向后兼容命名：实例状态在新语义中等同于 AI 会话通知状态。 */
export type AiRuntimeInstanceStatus = AiRuntimeSessionStatus

/** 向后兼容命名：实例生命周期快照在新语义中等同于会话通知快照。 */
export type AiRuntimeInstanceLifecycleSnapshot = AiRuntimeSessionLifecycleSnapshot

/** 模块声明“当前模块实例 ID”应如何暴露给 LLM。 */
export interface AiModuleInstanceParam {
  /** LLM 参数字段名，例如 `departmentId`、`personId`。 */
  readonly name: string
  /** 面向 LLM 的字段说明，解释该实例 ID 应从哪里取得。 */
  readonly description: string
}

/** 调用方传入的一条当前活动模块实例绑定。 */
export interface AiModuleInstanceBinding {
  /** 绑定对应的模块路径，例如 `department/personnel`。 */
  readonly modulePath: AiRuntimeModulePath
  /** 该模块当前选中的实例 ID。 */
  readonly instanceId: AiRuntimeModuleInstanceId
  /** 可选字段名；省略时由目标模块注册的 `instanceParam.name` 推导。 */
  readonly paramName?: string
}

/** 某次函数调用翻译时使用的 active path 快照。 */
export interface AiRuntimeActivePathSnapshot {
  /** 当前 AI 会话技术 ID，来自调用方传入的 scope。 */
  readonly instanceId: string
  /** 调用方传入并经 core 规范化后的活动路径绑定。 */
  readonly bindings: readonly AiModuleInstanceBinding[]
  /** 便于函数实现读取的“参数名 -> 模块实例 ID”映射。 */
  readonly moduleInstances: Readonly<Record<string, string>>
}

/** 模块 prompt provider 运行时获得的上下文。 */
export interface ModulePromptContext extends AiRuntimeInstanceScope {
  /** 当前 prompt 所属模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 当前模块路径拆分后的 ID 列表。 */
  readonly moduleIds: readonly string[]
}

/** 注册方真正执行函数时可使用的上下文，由 core 翻译生成后交回注册方。 */
export interface FunctionExecutionContext extends AiRuntimeInstanceScope {
  /** 被调用函数所在的模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 被调用函数所在模块路径拆分后的 ID 列表。 */
  readonly moduleIds: readonly string[]
  /** 被调用函数 ID。 */
  readonly functionId: AiRuntimeFunctionId
  /** LLM 提交的完整 action。 */
  readonly action: AiRuntimeAction
  /** 从顶层实例和 active path 汇总出的模块实例参数映射。 */
  readonly moduleInstances: Readonly<Record<string, string>>
  /** 本次翻译使用的 active path 快照。 */
  readonly activePath: AiRuntimeActivePathSnapshot
}

/** 模块 prompt 可以是静态字符串，也可以按当前会话上下文动态生成。 */
export type ModulePromptProvider = string | {
  bivarianceHack(context: ModulePromptContext): string | null | Promise<string | null>
}['bivarianceHack']

// =========================================================
// 三、模块知识注册契约
// =========================================================

/** 函数目录中预声明的失败模式，帮助 LLM 在调用前理解风险和修复路径。 */
export interface FunctionFailureMode {
  /** 稳定错误码。 */
  readonly code: string
  /** 什么时候会触发该失败模式。 */
  readonly when: string
  /** 出错后 LLM 或宿主应如何修复。 */
  readonly fix: string
}

/** 模块向 core 注册的函数知识。这里只描述模块内函数，不包含函数体，也不包含 LLM action 路径。 */
export interface AiFunctionRegistration {
  /** 模块内唯一函数 ID；只用于注册、翻译和执行上下文，不进入 LLM 函数投影。 */
  readonly functionId: AiRuntimeFunctionId
  /** 面向 LLM 的函数说明。 */
  readonly description: string
  /** 面向 LLM 的参数 schema；core 会注入必要的上下文参数。 */
  readonly paramsSchema: LlmParameterSchemaRoot
  /** 面向 LLM 的结果 schema；仅用于说明，不由 core 校验执行结果。 */
  readonly resultSchema?: LlmJsonObject | undefined
  /** 建议的最长执行时间；core 不解释该值，只透传给上层或落点。 */
  readonly maxExecutionMs?: number | undefined
  /** 面向 LLM 的调用规则。 */
  readonly usageRules?: readonly string[] | undefined
  /** 预声明失败模式。 */
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  /**
   * 函数作用域。
   * - `collection`：只需要父级模块实例 ID。
   * - `instance`：需要父级模块实例 ID，并额外需要当前模块自己的 instanceParam。
   */
  readonly scope?: 'collection' | 'instance'
}

/** 可直接持久化的函数注册数据；只保留描述，不保留执行器或运行时 provider。 */
export interface AiFunctionRegistrationData {
  /** 模块内唯一函数 ID；属于注册目录，不投影给 LLM。 */
  readonly functionId: AiRuntimeFunctionId
  /** 面向 LLM 的函数说明。 */
  readonly description: string
  /** 面向 LLM 的参数 schema；必须是 JSON 可持久化对象。 */
  readonly paramsSchema: LlmParameterSchemaRoot
  /** 面向 LLM 的结果 schema；仅用于说明，不由 core 校验执行结果。 */
  readonly resultSchema?: LlmJsonObject | undefined
  /** 建议的最长执行时间；core 不解释该值，只透传给上层或落点。 */
  readonly maxExecutionMs?: number | undefined
  /** 面向 LLM 的调用规则。 */
  readonly usageRules?: readonly string[] | undefined
  /** 预声明失败模式。 */
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  /** 函数作用域。 */
  readonly scope?: 'collection' | 'instance'
}

/** 可直接持久化的递归模块注册数据；运行时方法、动态 prompt provider 都不属于这里。 */
export interface AiModuleRegistrationData {
  /** 模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 模块名称。 */
  readonly name: string
  /** 模块职责说明。 */
  readonly description: string
  /** 静态模块 prompt；动态 provider 必须先在运行时解析，不能作为注册数据落库。 */
  readonly prompt?: string | undefined
  /** 当前模块自身实例参数声明。 */
  readonly instanceParam?: AiModuleInstanceParam | undefined
  /** 当前模块直接注册的函数数据。 */
  readonly functions: readonly AiFunctionRegistrationData[]
  /** 子模块注册数据。 */
  readonly modules: readonly AiModuleRegistrationData[]
}

/** 业务根注册数据；业务是应用对外注册入口，内部仍由递归模块树表达能力。 */
export interface AiBusinessRegistrationData {
  /** 业务 ID；作为业务根投影时映射为根 moduleId。 */
  readonly businessId: AiRuntimeModuleId
  /** 业务名称。 */
  readonly name: string
  /** 业务职责说明。 */
  readonly description: string
  /** 静态业务 prompt；动态 provider 必须先在运行时解析，不能作为注册数据落库。 */
  readonly prompt?: string | undefined
  /** 当前业务根实例参数声明。 */
  readonly instanceParam?: AiModuleInstanceParam | undefined
  /** 业务根直接注册的函数数据。 */
  readonly functions: readonly AiFunctionRegistrationData[]
  /** 业务内部模块注册数据。 */
  readonly modules: readonly AiModuleRegistrationData[]
}

/** 模块注册持久化快照中的模块行；可直接映射到数据库 module 表。 */
export interface AiModuleRegistrationStoreModule {
  /** 模块路径，例如 `pageDesign/nodeTree`；同一个快照内唯一。 */
  readonly modulePath: AiRuntimeModulePath
  /** 父模块路径；根模块为空。 */
  readonly parentModulePath?: AiRuntimeModulePath | undefined
  /** 模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 同级排序号。 */
  readonly sortOrder: number
  /** 模块名称。 */
  readonly name: string
  /** 模块职责说明。 */
  readonly description: string
  /** 静态模块 prompt。 */
  readonly prompt?: string | undefined
  /** 当前模块自身实例参数字段名。 */
  readonly instanceParamName?: string | undefined
  /** 当前模块自身实例参数说明。 */
  readonly instanceParamDescription?: string | undefined
}

/** 模块注册持久化快照中的函数行；可直接映射到数据库 function 表。 */
export interface AiFunctionRegistrationStoreFunction {
  /** 函数所属模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 模块内唯一函数 ID。 */
  readonly functionId: AiRuntimeFunctionId
  /** 同模块内排序号。 */
  readonly sortOrder: number
  /** 面向 LLM 的函数说明。 */
  readonly description: string
  /** 面向 LLM 的参数 schema；属于参数协议数据。 */
  readonly paramsSchema: LlmParameterSchemaRoot
  /** 面向 LLM 的结果 schema。 */
  readonly resultSchema?: LlmJsonObject | undefined
  /** 建议最长执行时间。 */
  readonly maxExecutionMs?: number | undefined
  /** 函数作用域。 */
  readonly scope?: 'collection' | 'instance'
}

/** 模块注册持久化快照中的函数使用规则行。 */
export interface AiFunctionRegistrationUsageRule {
  /** 函数所属模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 模块内唯一函数 ID。 */
  readonly functionId: AiRuntimeFunctionId
  /** 同函数内排序号。 */
  readonly sortOrder: number
  /** 规则文本。 */
  readonly rule: string
}

/** 模块注册持久化快照中的函数失败模式行。 */
export interface AiFunctionRegistrationFailureMode {
  /** 函数所属模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 模块内唯一函数 ID。 */
  readonly functionId: AiRuntimeFunctionId
  /** 同函数内排序号。 */
  readonly sortOrder: number
  /** 稳定错误码。 */
  readonly code: string
  /** 什么时候会触发该失败模式。 */
  readonly when: string
  /** 出错后 LLM 或宿主应如何修复。 */
  readonly fix: string
}

/** 完全结构化的模块注册持久化快照；不包含嵌套树、运行时方法或执行器。 */
export interface AiModuleRegistrationStoreSnapshot {
  /** 根模块路径。 */
  readonly rootModulePath: AiRuntimeModulePath
  /** 模块行。 */
  readonly modules: readonly AiModuleRegistrationStoreModule[]
  /** 函数行。 */
  readonly functions: readonly AiFunctionRegistrationStoreFunction[]
  /** 函数使用规则行。 */
  readonly usageRules: readonly AiFunctionRegistrationUsageRule[]
  /** 函数失败模式行。 */
  readonly failureModes: readonly AiFunctionRegistrationFailureMode[]
}

/** 业务根注册持久化快照；行结构复用模块注册快照，只额外标明根业务路径。 */
export interface AiBusinessRegistrationStoreSnapshot extends AiModuleRegistrationStoreSnapshot {
  /** 根业务路径；等同于业务根投影时的 rootModulePath。 */
  readonly rootBusinessPath: AiRuntimeModulePath
}

/** 模块注册便捷基类：只帮助模块声明“函数 + 子模块”metadata，不提供生命周期管理。 */
export abstract class AiModuleRegistrationBase implements AiModuleRegistration {
  protected constructor(
    /** 模块 ID。 */
    public readonly moduleId: string,
    /** 面向人类和 LLM 的模块名称。 */
    public readonly name: string,
    /** 面向 LLM 的模块职责说明。 */
    public readonly description: string,
    /** 模块 prompt 或 prompt provider。 */
    public readonly prompt?: ModulePromptProvider,
    /** 子模块列表；core 会递归投影。 */
    public readonly modules: readonly AiModuleRegistration[] = [],
    /** 当前模块自身实例参数声明。 */
    public readonly instanceParam?: AiModuleInstanceParam,
  ) {}

  /** 返回当前模块直接暴露的函数知识。 */
  abstract getFunctions(): readonly AiFunctionRegistration[]
}

/** 递归模块注册契约。模块目录只描述当前模块的函数与子模块，调用路径由 core 投影生成。 */
export interface AiModuleRegistration {
  /** 模块 ID；同一注册树内必须唯一，因为 LLM action 使用模块段定位能力。 */
  readonly moduleId: AiRuntimeModuleId
  /** 模块名称。 */
  readonly name: string
  /** 模块职责说明。 */
  readonly description: string
  /** 模块 prompt 或 prompt provider。 */
  readonly prompt?: ModulePromptProvider | undefined
  /** 子模块列表。 */
  readonly modules?: readonly AiModuleRegistration[] | undefined
  /** 当前模块自身实例参数声明。 */
  readonly instanceParam?: AiModuleInstanceParam | undefined
  /** 返回当前模块直接暴露的函数知识；函数体和调用路径都不属于 core 注册目录。 */
  getFunctions(): readonly AiFunctionRegistration[]
}

/**
 * 业务根注册契约。
 *
 * 业务是应用对外的唯一注册物；模块只作为业务内部的能力分层。
 * Core 只消费这棵知识树，不创建、不保存、不释放业务 live state。
 */
export interface AiBusinessRegistration {
  /** 业务 ID；同一 core facade 内唯一。 */
  readonly businessId: AiRuntimeModuleId
  /** 业务名称。 */
  readonly name: string
  /** 业务职责说明。 */
  readonly description: string
  /** 业务 prompt 或 prompt provider。 */
  readonly prompt?: ModulePromptProvider | undefined
  /** 业务内部模块列表；core 会递归投影。 */
  readonly modules?: readonly AiModuleRegistration[] | undefined
  /** 当前业务根实例参数声明。 */
  readonly instanceParam?: AiModuleInstanceParam | undefined
  /** 业务根直接暴露的函数知识；函数体和调用路径都不属于 core 注册目录。 */
  getFunctions(): readonly AiFunctionRegistration[]
  /** 业务需要挂载的参数 payload provider；注册时由 core 统一安装到知识投影器可见的注册表。 */
  readonly parameterPayloadProviders?: readonly ParameterPayloadProvider[] | undefined
}

// =========================================================
// 四、投影给 LLM 的模块与函数暴露结构
// =========================================================

/** core 注入到函数 schema 中的上下文参数说明。 */
export interface AiRuntimeFunctionContextParam {
  /** 该参数绑定的模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 该参数绑定的模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 参数字段名。 */
  readonly paramName: string
  /** 面向 LLM 的参数说明。 */
  readonly description: string
}

/** LLM 可见的单个函数暴露结果。 */
export interface AiRuntimeFunctionExposure {
  /** core 基于当前会话投影出的完整 LLM action，例如 `root-1@module@actionName`。 */
  readonly action: AiRuntimeAction
  /** 函数所在模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 函数所在模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 函数所在模块路径拆分后的 ID 列表。 */
  readonly moduleIds: readonly string[]
  /** 面向 LLM 的函数说明。 */
  readonly description: string
  /** 注入上下文参数后的 LLM 参数 schema。 */
  readonly paramsSchema: LlmParameterSchemaRoot
  /** 函数结果说明。 */
  readonly resultSchema?: LlmJsonObject | undefined
  /** 建议最长执行时间，只透传给上层。 */
  readonly maxExecutionMs?: number | undefined
  /** 调用规则。 */
  readonly usageRules?: readonly string[] | undefined
  /** 预声明失败模式。 */
  readonly failureModes?: readonly FunctionFailureMode[] | undefined
  /** 由模块层级推导出的上下文参数列表。 */
  readonly contextParams: readonly AiRuntimeFunctionContextParam[]
}

/** LLM 可见的递归模块暴露结果。 */
export interface AiRuntimeModuleExposure {
  /** 模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 模块路径。 */
  readonly modulePath: AiRuntimeModulePath
  /** 模块路径拆分后的 ID 列表。 */
  readonly moduleIds: readonly string[]
  /** 模块名称。 */
  readonly name: string
  /** 模块职责说明。 */
  readonly description: string
  /** 当前会话下解析后的模块 prompt。 */
  readonly prompt?: string | undefined
  /** 当前模块自身实例参数声明。 */
  readonly instanceParam?: AiModuleInstanceParam | undefined
  /** 当前模块直接暴露的函数列表。 */
  readonly functions: readonly AiRuntimeFunctionExposure[]
  /** 子模块暴露结果。 */
  readonly modules: readonly AiRuntimeModuleExposure[]
}

/** 一次会话 scope 下的完整 LLM 知识投影。 */
export interface AiRuntimeKnowledgeProjection {
  /** 本次投影对应的调用方会话 scope。 */
  readonly scope: AiRuntimeInstanceScope
  /** 递归模块树暴露结果。 */
  readonly module: AiRuntimeModuleExposure
  /** 聚合所有模块 prompt 后的文本快照。 */
  readonly promptSnapshot: string
  /** 展平后的可用函数列表，适合直接投影为 LLM tool schema。 */
  readonly availableFunctions: readonly AiRuntimeFunctionExposure[]
}

// =========================================================
// 五、AI 会话与历史记录
// =========================================================

/**
 * 对话消息角色。
 *
 * 这里记录的是 AI 会话中进入模型上下文的消息角色，不等同于模块自身角色。
 */
export type AiRuntimeMessageRole = 'system' | 'user' | 'assistant'

/**
 * 消息来源。
 *
 * - `ui`：用户在界面中的人工输入或人工确认。
 * - `llm`：LLM 生成的自然语言回复。
 * - `system`：宿主注入的系统提示、状态提示或控制消息。
 */
export type AiRuntimeMessageSource = 'ui' | 'llm' | 'system'

/** core 历史记录条目类型。 */
export type AiRuntimeHistoryEntryKind = 'message' | 'functionCall'

/** LLM 编排的函数调用在历史中的状态。 */
export type AiRuntimeFunctionCallHistoryStatus = 'requested' | 'completed' | 'failed'

/** 所有历史条目的公共 envelope。 */
export interface AiRuntimeHistoryEntryBase extends AiRuntimeInstanceScope {
  /** core 生成的历史条目 ID。 */
  readonly id: string
  /** 当前 AI session 内单调递增的序号。 */
  readonly seq: number
  /** 记录时间；由 `AiRuntimeOptions.now` 提供或使用 Date.now。 */
  readonly timestamp: number
  /** 历史条目类型。 */
  readonly kind: AiRuntimeHistoryEntryKind
}

/** UI/LLM/system 消息历史。 */
export interface AiRuntimeMessageHistoryEntry extends AiRuntimeHistoryEntryBase {
  /** 固定为 message。 */
  readonly kind: 'message'
  /** 消息角色。 */
  readonly role: AiRuntimeMessageRole
  /** 消息来源。 */
  readonly source: AiRuntimeMessageSource
  /** 消息文本内容。 */
  readonly content: string
  /** 宿主可选附加信息；core 只保存，不解释。 */
  readonly metadata?: Record<string, unknown> | undefined
}

/** LLM 编排的一次函数调用历史。 */
export interface AiRuntimeFunctionCallHistoryEntry extends AiRuntimeHistoryEntryBase {
  /** 固定为 functionCall。 */
  readonly kind: 'functionCall'
  /** LLM 请求调用的完整 action。 */
  readonly action: AiRuntimeAction
  /** LLM 提交的原始参数。 */
  readonly args: unknown
  /** 调用记录状态；core 只记录，不据此调度下一步。 */
  readonly status: AiRuntimeFunctionCallHistoryStatus
  /** 函数调用完成时间；requested 状态下为空。 */
  readonly completedAt?: number | undefined
  /** 如果已经执行完成，保存注册方返回的原始结果。 */
  readonly result?: unknown
  /** 如果已经生成 LLM tool result，保存序列化后的结果消息。 */
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  /** 如果翻译、执行或模块侧校验失败，保存结构化错误。 */
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  /** 被调用函数所在模块路径；未知时可省略。 */
  readonly modulePath?: AiRuntimeModulePath | undefined
  /** 被调用函数 ID；未知时可省略。 */
  readonly functionId?: AiRuntimeFunctionId | undefined
  /** 本次函数调用使用的 active path 快照；core 只保存快照，不维护 active path 状态。 */
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  /** 宿主可选附加信息；core 只保存，不解释。 */
  readonly metadata?: Record<string, unknown> | undefined
}

/** AI 会话历史统一条目。 */
export type AiRuntimeHistoryEntry = AiRuntimeMessageHistoryEntry | AiRuntimeFunctionCallHistoryEntry

/** core 管理的 AI 会话记录。 */
export interface AiRuntimeSessionRecord extends AiRuntimeInstanceScope {
  /** 会话隔离键由 `moduleId + moduleInstanceId` 决定，instanceId 只是技术 alias。 */
  readonly moduleId: AiRuntimeModuleId
  /** 根模块实例 ID；与 moduleId 一起隔离 AI 会话。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  /** 当前 AI 会话状态；不代表模块服务状态。 */
  readonly status: AiRuntimeSessionStatus
  /** 首次 start 时间。 */
  readonly startedAt: number
  /** 最近一次更新 session 或追加历史的时间。 */
  readonly updatedAt: number
  /** 最近一次 stop 时间。 */
  readonly stoppedAt?: number | undefined
  /** 最近一次 start/stop 原因。 */
  readonly reason?: string | undefined
  /** 最近一次知识投影快照，便于宿主恢复同一轮上下文。 */
  readonly latestProjection?: AiRuntimeKnowledgeProjection | undefined
  /** UI/LLM 消息和 LLM 函数调用历史。 */
  readonly history: readonly AiRuntimeHistoryEntry[]
}

/** 追加 UI/LLM/system 消息历史的输入。 */
export interface AiRuntimeAppendMessageOptions extends AiRuntimeInstanceScope {
  /** 消息角色。 */
  readonly role: AiRuntimeMessageRole
  /** 消息文本内容。 */
  readonly content: string
  /** 消息来源；省略时按 role 推导。 */
  readonly source?: AiRuntimeMessageSource | undefined
  /** 宿主可选附加信息；core 只保存，不解释。 */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 追加 LLM 函数调用历史的输入。 */
export interface AiRuntimeAppendFunctionCallOptions extends AiRuntimeInstanceScope {
  /** LLM 请求调用的完整 action。 */
  readonly action: AiRuntimeAction
  /** LLM 提交的原始参数。 */
  readonly args: unknown
  /** 调用记录状态；省略时默认为 completed。 */
  readonly status?: AiRuntimeFunctionCallHistoryStatus | undefined
  /** 注册方执行函数得到的原始结果。 */
  readonly result?: unknown
  /** 序列化后的 LLM tool result。 */
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  /** 翻译、执行或模块侧校验失败时的结构化错误。 */
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  /** 被调用函数所在模块路径；未知时可省略。 */
  readonly modulePath?: AiRuntimeModulePath | undefined
  /** 被调用函数 ID；未知时可省略。 */
  readonly functionId?: AiRuntimeFunctionId | undefined
  /** 本次函数调用使用的 active path 快照。 */
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  /** 宿主可选附加信息；core 只保存，不解释。 */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 记录 LLM 刚刚编排出的一次函数调用请求。 */
export interface AiRuntimeRecordFunctionCallRequestOptions extends AiRuntimeInstanceScope {
  /** LLM 请求调用的完整 action。 */
  readonly action: AiRuntimeAction
  /** LLM 提交的原始参数。 */
  readonly args: unknown
  /** 被调用函数所在模块路径；未知时可省略。 */
  readonly modulePath?: AiRuntimeModulePath | undefined
  /** 被调用函数 ID；未知时可省略。 */
  readonly functionId?: AiRuntimeFunctionId | undefined
  /** 本次函数调用使用的 active path 快照。 */
  readonly activePath?: AiRuntimeActivePathSnapshot | undefined
  /** 宿主可选附加信息；core 只保存，不解释。 */
  readonly metadata?: Record<string, unknown> | undefined
}

/** 将已记录的 LLM 函数调用请求标记为完成或失败。 */
export interface AiRuntimeCompleteFunctionCallOptions extends AiRuntimeInstanceScope {
  /** `recordFunctionCallRequest` 返回的历史条目 ID。 */
  readonly historyEntryId: string
  /** 完成状态；省略时根据 error 是否存在推导。 */
  readonly status?: Extract<AiRuntimeFunctionCallHistoryStatus, 'completed' | 'failed'> | undefined
  /** 注册方执行函数得到的原始结果。 */
  readonly result?: unknown
  /** 序列化后的 LLM tool result。 */
  readonly resultMessage?: AiRuntimeFunctionResultMessage | undefined
  /** 翻译、执行或模块侧校验失败时的结构化错误。 */
  readonly error?: AiRuntimeFunctionCallFailure | undefined
  /** 宿主可选附加信息；core 只保存，不解释。 */
  readonly metadata?: Record<string, unknown> | undefined
}

// =========================================================
// 六、函数调用翻译与结果回传契约
// =========================================================

/** 函数调用或翻译失败的统一错误形态。 */
export interface AiRuntimeFunctionCallFailure {
  /** 固定为 false，便于调用方判别失败。 */
  readonly ok: false
  /** 稳定错误码。 */
  readonly code: string
  /** 可读错误信息。 */
  readonly msg: string
  /** 面向调用方或 LLM 的修复建议。 */
  readonly fix: string
}

/** 注册方执行函数后可选择返回的统一结果形态；core 不读取它做编排或验证。 */
export type AiRuntimeFunctionCallResult<TResult = unknown> =
  | {
      /** 固定为 true，表示函数执行成功。 */
      ok: true
      /** 注册方返回的数据。 */
      data: TResult
      /** 面向人类或 LLM 的简短结果摘要。 */
      summary: string
    }
  | AiRuntimeFunctionCallFailure

/** 注册方或宿主把执行结果交给 core 转成 LLM 消息时的输入。 */
export interface AiRuntimeCreateFunctionResultMessageOptions {
  /** 刚刚执行的完整 action；仅用于 LLM 回看上下文，不触发 core 侧流程判断。 */
  readonly action: AiRuntimeAction
  /** 注册方执行函数得到的原始结果；core 不校验、不改写、不根据它决定下一步。 */
  readonly result: unknown
}

/** LLM 可消费的函数执行结果消息。 */
export interface AiRuntimeFunctionResultMessage {
  /** 对应的完整 action。 */
  readonly action: AiRuntimeAction
  /** 注册方执行函数得到的原始结果引用。 */
  readonly result: unknown
  /** 序列化后的 tool result 内容，可直接交给 LLM；决策权仍在 LLM/宿主。 */
  readonly content: string
}

/** core 对一次 LLM 函数调用完成翻译后的结果。 */
export interface AiRuntimeFunctionCallTranslation {
  /** LLM 提交的完整 action。 */
  readonly action: AiRuntimeAction
  /** LLM 提交的原始 args。 */
  readonly rawArgs: unknown
  /** 含上下文参数补齐后的参数，用于结构校验和错误回显。 */
  readonly effectiveArgs: Record<string, unknown>
  /** 剥离上下文参数后交给注册方执行器的调用参数。 */
  readonly executionArgs: unknown
  /** 注册方执行函数时应使用的上下文。 */
  readonly context: FunctionExecutionContext
  /** 本次调用命中的 LLM 函数暴露项。 */
  readonly exposure: AiRuntimeFunctionExposure
  /** 本次调用命中的模块注册。 */
  readonly moduleRegistration: AiModuleRegistration
  /** 本次调用命中的函数注册。 */
  readonly functionRegistration: AiFunctionRegistration
}

/** 函数调用翻译结果：成功返回 translation，失败返回结构化错误。 */
export type AiRuntimeFunctionCallTranslationResult =
  | { ok: true; translation: AiRuntimeFunctionCallTranslation }
  | AiRuntimeFunctionCallFailure

/** 请求 core 投影某个会话 scope 下的模块知识。 */
export interface AiRuntimeProjectKnowledgeOptions extends AiRuntimeInstanceScope {}

/** 请求 core 翻译一次 LLM 函数调用。 */
export interface AiRuntimeTranslateFunctionCallOptions extends AiRuntimeInstanceScope {
  /** LLM 提交的完整 action。 */
  readonly action: AiRuntimeAction
  /** LLM 提交的原始 args。 */
  readonly args: unknown
  /** 宿主或注册方管理的当前模块实例路径；core 只消费这份输入，不保存。 */
  readonly activePath?: readonly AiModuleInstanceBinding[] | undefined
  /** 允许调用方传入同一轮已投影的函数曝光，避免动态目录在一轮内漂移。 */
  readonly projection?: AiRuntimeKnowledgeProjection | undefined
}

/** core 执行翻译链路交给模块落点前后的统一输入。 */
export interface AiRuntimeFunctionCallRunInput {
  /** 已由 core 完成 action/参数/上下文翻译的调用。 */
  readonly translation: AiRuntimeFunctionCallTranslation
  /** 本次调用命中的模块注册描述。 */
  readonly moduleRegistration: AiModuleRegistration
  /** 本次调用命中的函数注册描述。 */
  readonly functionRegistration: AiFunctionRegistration
  /** 剥离上下文参数后交给模块落点的参数。 */
  readonly args: unknown
  /** core 翻译出的模块执行上下文。 */
  readonly context: FunctionExecutionContext
}

/** 模块落点可选的二次业务参数校验；core 负责调用并记录结果。 */
export type AiRuntimeFunctionCallValidator = (input: AiRuntimeFunctionCallRunInput) => string | null

/** 模块落点函数；core 负责执行翻译、账本记录和结果回填。 */
export type AiRuntimeFunctionCallRunner = (
  input: AiRuntimeFunctionCallRunInput,
) => unknown

/** 调用方可选的结果归一化；省略时 core 会把普通对象包成 ok result。 */
export type AiRuntimeFunctionCallResultNormalizer = (
  value: unknown,
  input: AiRuntimeFunctionCallRunInput,
) => AiRuntimeFunctionCallResult<unknown>

/** 请求 core 完整处理一次函数调用翻译、记录、落点运行和回填。 */
export interface AiRuntimeExecuteFunctionCallOptions extends AiRuntimeTranslateFunctionCallOptions {
  /** 模块落点函数。注册层只提供落点，翻译和账本流转由 core 处理。 */
  readonly run: AiRuntimeFunctionCallRunner
  /** 可选业务校验，发生在 core 参数 schema 校验之后、落点运行之前。 */
  readonly validate?: AiRuntimeFunctionCallValidator | undefined
  /** 可选结果归一化。 */
  readonly normalizeResult?: AiRuntimeFunctionCallResultNormalizer | undefined
  /** 落点抛错时给 LLM/宿主的修复建议。 */
  readonly errorFix?: string | undefined
}

/** AI 会话开始通知。core 返回投影、生命周期快照，并保存 AI session record。 */
export interface AiRuntimeStartSessionOptions {
  /** 顶层模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 顶层模块实例 ID。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  /**
   * 由注册方/宿主管理的 AI 会话技术 ID。省略时 core 仅用 moduleInstanceId
   * 作为 LLM envelope ID；会话隔离仍以 `moduleId + moduleInstanceId` 为准。
   */
  readonly instanceId?: string | undefined
  /** 可显式指定函数上下文中的 runtimeInstanceId；省略时等于 instanceId。 */
  readonly runtimeInstanceId?: string | undefined
  /** 会话开始原因，core 只透传到返回快照。 */
  readonly reason?: string | undefined
}

/** AI 会话开始通知的返回值。 */
export interface AiRuntimeStartSessionResult extends AiRuntimeKnowledgeProjection {
  /** 固定为 Started，表示本次通知语义。 */
  readonly status: 'Started'
  /** 归一化后的 AI 会话 ID。 */
  readonly instanceId: string
  /** 顶层模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 顶层模块实例 ID。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  /** 本次会话开始通知快照。 */
  readonly lifecycle: AiRuntimeInstanceLifecycleSnapshot
  /** core 保存后的 AI 会话记录快照。 */
  readonly session: AiRuntimeSessionRecord
}

/** AI 会话结束通知。core 更新 AI session record，但不释放模块服务。 */
export interface AiRuntimeStopSessionOptions {
  /** 顶层模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 顶层模块实例 ID。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  /** 调用方自有 AI 会话 ID；省略时用 moduleInstanceId。 */
  readonly instanceId?: string | undefined
  /** 会话结束原因，core 只透传到返回快照。 */
  readonly reason?: string | undefined
}

/** AI 会话结束通知的返回值。 */
export interface AiRuntimeStopSessionResult {
  /** 固定为 Stopped，表示本次通知语义。 */
  readonly status: 'Stopped'
  /** 归一化后的 AI 会话 ID。 */
  readonly instanceId: string
  /** 顶层模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 顶层模块实例 ID。 */
  readonly moduleInstanceId: AiRuntimeModuleInstanceId
  /** 本次会话结束通知快照。 */
  readonly lifecycle: AiRuntimeInstanceLifecycleSnapshot
  /** core 保存后的 AI 会话记录快照。 */
  readonly session: AiRuntimeSessionRecord
}

/** AiRuntime 配置项。 */
export interface AiRuntimeOptions {
  /** 可注入时间源，仅用于会话生命周期通知快照；不参与模块生命周期决策。 */
  now?: () => number
}

/** 注册器返回的模块绑定 start options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleStartSessionOptions = Omit<AiRuntimeStartSessionOptions, 'moduleId'>

/** 注册器返回的模块绑定 stop options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleStopSessionOptions = Omit<AiRuntimeStopSessionOptions, 'moduleId'>

/** 注册器返回的模块绑定投影 options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleProjectKnowledgeOptions = Omit<AiRuntimeProjectKnowledgeOptions, 'moduleId'>

/** 注册器返回的模块绑定消息记录 options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleAppendMessageOptions = Omit<AiRuntimeAppendMessageOptions, 'moduleId'>

/** 注册器返回的模块绑定函数调用记录 options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleAppendFunctionCallOptions = Omit<AiRuntimeAppendFunctionCallOptions, 'moduleId'>

/** 注册器返回的模块绑定函数调用请求记录 options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleRecordFunctionCallRequestOptions = Omit<AiRuntimeRecordFunctionCallRequestOptions, 'moduleId'>

/** 注册器返回的模块绑定函数调用完成记录 options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleCompleteFunctionCallOptions = Omit<AiRuntimeCompleteFunctionCallOptions, 'moduleId'>

/** 注册器返回的模块绑定函数调用翻译 options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleTranslateFunctionCallOptions = Omit<AiRuntimeTranslateFunctionCallOptions, 'moduleId'>

/** 注册器返回的模块绑定函数调用执行 options；moduleId 已由注册句柄补齐。 */
export type AiRegisteredModuleExecuteFunctionCallOptions = Omit<AiRuntimeExecuteFunctionCallOptions, 'moduleId'>

/**
 * 模块注册成功后由 core 返回给注册方的功能 API 包装器。
 *
 * 这个包装器只绑定 `moduleId` 并串起 AI 会话数据链路：
 * start/project -> append message -> translate -> record request -> result message -> complete -> stop。
 * 它不创建、停止或释放模块服务实例；注册方可在自己的服务管理代码里组合这些 API。
 */
export interface AiRegisteredModuleApi {
  /** 已绑定的顶层模块 ID。 */
  readonly moduleId: AiRuntimeModuleId
  /** 注册方传入的模块目录。 */
  readonly registration: AiModuleRegistration
  /** 读取当前模块注册。 */
  getRegistration(): AiModuleRegistration
  /** 读取当前模块注册的纯数据快照；可直接 JSON 序列化后由上层写入数据库。 */
  getRegistrationData(): AiModuleRegistrationData
  /** 读取当前模块注册的结构化持久化快照；可拆表写库，由上层持久化。 */
  getRegistrationStoreSnapshot(): AiModuleRegistrationStoreSnapshot
  /** 按根模块实例 ID 读取当前模块的 AI 会话记录。 */
  getSession(moduleInstanceId: AiRuntimeModuleInstanceId): AiRuntimeSessionRecord | null
  /** 按根模块实例 ID 读取当前模块的 AI 会话历史。 */
  getSessionHistory(moduleInstanceId: AiRuntimeModuleInstanceId): readonly AiRuntimeHistoryEntry[]
  /** 追加 UI/LLM/system 消息历史。 */
  appendMessage(options: AiRegisteredModuleAppendMessageOptions): AiRuntimeMessageHistoryEntry
  /** 记录 LLM 编排出的一次函数调用请求。 */
  recordFunctionCallRequest(options: AiRegisteredModuleRecordFunctionCallRequestOptions): AiRuntimeFunctionCallHistoryEntry
  /** 把 requested 函数调用更新为 completed/failed。 */
  completeFunctionCall(options: AiRegisteredModuleCompleteFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry
  /** 追加 LLM 编排的函数调用历史。 */
  appendFunctionCall(options: AiRegisteredModuleAppendFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry
  /** 接收当前模块的 AI 会话开始通知，并返回 LLM 知识投影。 */
  startSession(options: AiRegisteredModuleStartSessionOptions): Promise<AiRuntimeStartSessionResult>
  /** 接收当前模块的 AI 会话结束通知。 */
  stopSession(options: AiRegisteredModuleStopSessionOptions): AiRuntimeStopSessionResult
  /** 投影当前模块在某个会话 scope 下的 LLM 知识。 */
  projectKnowledge(options: AiRegisteredModuleProjectKnowledgeOptions): Promise<AiRuntimeKnowledgeProjection>
  /** 翻译一次当前模块 scope 下的 LLM 函数调用。 */
  translateFunctionCall(options: AiRegisteredModuleTranslateFunctionCallOptions): Promise<AiRuntimeFunctionCallTranslationResult>
  /** 由 core 完整处理一次当前模块 scope 下的函数调用翻译、记录、落点运行和回填。 */
  executeFunctionCall(options: AiRegisteredModuleExecuteFunctionCallOptions): Promise<AiRuntimeFunctionCallResult<unknown>>
  /** 把注册方执行结果序列化成 LLM tool result；不验证结果、不做编排决策。 */
  createFunctionResultMessage(options: AiRuntimeCreateFunctionResultMessageOptions): AiRuntimeFunctionResultMessage
}

/** 注册器返回的业务绑定 API；语义上绑定 businessId，底层复用模块投影/会话链路。 */
export interface AiRegisteredBusinessApi extends AiRegisteredModuleApi {
  /** 已绑定的业务 ID。 */
  readonly businessId: AiRuntimeModuleId
  /** 注册方传入的业务目录。 */
  readonly businessRegistration: AiBusinessRegistration
  /** 读取当前业务注册。 */
  getBusinessRegistration(): AiBusinessRegistration
  /** 读取当前业务注册的纯数据快照；可直接 JSON 序列化后由上层写入数据库。 */
  getBusinessRegistrationData(): AiBusinessRegistrationData
  /** 读取当前业务注册的结构化持久化快照；可拆表写库，由上层持久化。 */
  getBusinessRegistrationStoreSnapshot(): AiBusinessRegistrationStoreSnapshot
}

/** core 对外 API：只负责注册模块知识并返回绑定 handle；会话能力由 handle 承接。 */
export interface AiRuntimeApi {
  /** 注册一个业务根知识树；重复 businessId 会 fail-fast，并返回绑定 businessId 的 API 包装器。 */
  registerBusiness(registration: AiBusinessRegistration | AiBusinessRegistrationData | AiBusinessRegistrationStoreSnapshot): AiRegisteredBusinessApi
  /** 注册一个顶层模块知识树；重复 moduleId 会 fail-fast，并返回绑定 moduleId 的 API 包装器。 */
  registerModule(registration: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiRegisteredModuleApi
  /** 获取核心层知识投影器（统一的函数目录、模块目录、参数 payload 查询入口）。 */
  getKnowledgeProjection(): unknown // AiKnowledgeProjection（需要通过 @spark-view/spark-ai 导出）
}
