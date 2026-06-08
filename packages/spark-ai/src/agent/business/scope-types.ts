/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · 业务作用域类型                                                     │
 * │  Business Scope & Context Types                                              │
 * │                                                                              │
 * │  本文件定义业务实例的定位、作用域和运行时上下文的类型层次。                       │
 * │  从"找到哪个业务"到"当前会话快照"再到"回调参数"，逐步细化。                     │
 * │                                                                              │
 * │  类型层次：                                                                   │
 * │    AiAgentTarget           — 业务定位（哪个注册的哪个实例）              │
 * │      └─ AiAgentScope       — 业务作用域（定位 + 会话/运行时 ID）        │
 * │    AiAgentRuntimeContext   — 运行时上下文（传递给生命周期回调）          │
 * │    AiAgentAppendMessageOptions — 追加消息参数（上下文 + 消息字段）      │
 * │                                                                              │
 * │  使用场景：                                                                   │
 * │    · Target   → registry.createBusiness() 时定位                              │
 * │    · Scope    → tool-loop-runner 全程持有，turn stream 流键生成               │
 * │    · Context  → systemPrompt / afterFunctionCall / onStartSession 回调入参    │
 * │    · Options  → session.appendMessage() 入参                                  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type {
  AiAgentMessageRole,
  AiAgentMessageSource,
} from '../session/session-types'

/* -------------------------------------------------------------------------------
 * 一、业务定位基类
 * -------------------------------------------------------------------------------
 * 用两个 ID 精确定位一个顶层业务实例：
 *   - businessRegistrationId：业务注册 ID
 *   - businessInstanceId：业务实例 ID
 * ----------------------------------------------------------------------------- */

/**
 * 业务定位基类，用两个 ID 精确定位一个顶层业务实例：
 * businessRegistrationId — 顶层 kind（对应 BusinessRegistry 中的注册项）
 * businessInstanceId     — 顶层实例 ID（同一次会话内不变）
 */
export class AiAgentTarget {
  public constructor(
    public readonly businessRegistrationId: string,
    public readonly businessInstanceId: string,
  ) {}
}

/* -------------------------------------------------------------------------------
 * 二、业务作用域（继承自定位基类）
 * -------------------------------------------------------------------------------
 * 在业务定位基础上追加运行时标识，构成完整的"当前上下文坐标"：
 *   - instanceId：顶层实例 ID，参与 kind + instanceId 生成后端 sessionId
 *   - runtimeInstanceId：工具 runtime 内部实例 ID（当前同顶层实例 ID）
 *
 * Scope 是 tool-loop-runner 的核心持有对象，贯穿整个会话生命周期。
 * 同时也是 turnKey / streamKey 的数据来源——键由 Scope 字段编码生成。
 * ----------------------------------------------------------------------------- */

/**
 * 业务作用域（继承自定位基类），在业务定位基础上追加运行时标识。
 * instanceId        — 顶层实例 ID，参与 kind + instanceId 生成后端 sessionId
 * runtimeInstanceId — 工具 runtime 内部实例 ID（当前同顶层实例 ID）
 *
 * Scope 是 tool-loop-runner 的核心持有对象，贯穿整个会话生命周期，
 * 同时也是 turnKey / streamKey 的数据来源。
 */
export class AiAgentScope extends AiAgentTarget {
  public constructor(
    businessRegistrationId: string,
    businessInstanceId: string,
    public readonly instanceId: string,
    public readonly runtimeInstanceId: string,
  ) {
    super(businessRegistrationId, businessInstanceId)
  }
}

/* -------------------------------------------------------------------------------
 * 三、运行时上下文
 * -------------------------------------------------------------------------------
 * 传递给生命周期回调的精简上下文，只包含模块层标识：
 *   - moduleId：业务模块 ID（对应 registration.moduleId）
 *   - moduleInstanceId：顶层模块实例 ID（pageId、leaveDraftId 等）
 *   - instanceId：顶层实例 ID；后端 sessionId 由 moduleId + instanceId 生成
 *
 * 与 Scope 的区别：不含 businessRegistrationId / businessInstanceId，
 * 因为生命周期回调已在具体业务实例内部执行，无需重复定位。
 * ----------------------------------------------------------------------------- */

/**
 * 传递给生命周期回调的精简上下文。
 * moduleId         — 业务模块 ID（对应 registration.moduleId）
 * moduleInstanceId — 顶层模块实例 ID（pageId、leaveDraftId 等）
 * instanceId       — 顶层实例 ID；后端 sessionId 由 moduleId + instanceId 生成
 *
 * 与 Scope 的区别：不含 businessRegistrationId / businessInstanceId，
 * 因为生命周期回调已在具体业务实例内部执行，无需重复定位。
 */
export class AiAgentRuntimeContext {
  public constructor(
    public readonly moduleId: string,
    public readonly moduleInstanceId: string,
    public readonly instanceId: string,
  ) {}
}

/* -------------------------------------------------------------------------------
 * 四、追加消息参数
 * -------------------------------------------------------------------------------
 * 向会话历史追加一条消息时所需的完整参数。
 * 继承自 RuntimeContext（确定写入哪个会话），追加消息体字段。
 * ----------------------------------------------------------------------------- */

export type AiAgentAppendMessageOptions = AiAgentRuntimeContext & Readonly<{
  /** 消息角色：user / assistant / system / tool */
  role: AiAgentMessageRole
  /** 消息正文 */
  content: string
  /** 消息来源标注（用于区分用户输入 / LLM 输出 / 工具返回值） */
  source?: AiAgentMessageSource
  /** 附加元数据（如工具调用 ID、token 用量等） */
  metadata?: Record<string, unknown>
}>
