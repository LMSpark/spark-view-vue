/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · 业务注册合约                                                      │
 * │  Business Registration Contract                                              │
 * │                                                                              │
 * │  本文件定义业务接入 AI Host 的注册入口——外部系统将自身能力封装为                │
 * │  ModuleSemanticRuntime 后，通过 AiHostBusinessRegistration 注册到              │
 * │  AiHostBusinessRegistry，由后者统一管理会话生命周期与工具调用调度。              │
 * │                                                                              │
 * │  数据流向：                                                                   │
 * │    外部系统 ──(封装)──> ModuleSemanticRuntime                                  │
 * │                    ──(包装)──> AiHostBusinessRegistration                     │
 * │                    ──(注册)──> AiHostBusinessRegistry ──> AiHostBusiness      │
 * │                    ──(驱动)──> AiHostToolLoopRunner ──> LLM                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { ModuleSemanticRuntime } from '../../module-semantic/runtime/module-semantic-runtime'
import type { AiHostSessionStore } from '../session/session-types'
import type { AiHostBusinessInputContract } from './business-task'
import type {
  AiHostBusinessAfterFunctionCallOptions,
  AiHostBusinessLifecycleDirective,
} from './lifecycle-types'
import type { AiHostBusinessRuntimeContext } from './scope-types'

/* -------------------------------------------------------------------------------
 * 一、注册参数类型
 * -------------------------------------------------------------------------------
 * 创建 AiHostBusinessRegistration 实例时传入的配置对象。
 * 所有回调函数均为可选——不传则跳过对应生命周期节点。
 * ----------------------------------------------------------------------------- */

export type AiHostBusinessRegistrationOptions = Readonly<{
  /** 业务模块唯一标识，对应 ModuleSemanticRuntime.moduleId */
  moduleId: string
  /** 面向 LLM 的业务名称，出现在系统提示中 */
  name: string
  /** 面向 LLM 的业务描述，说明该业务能做什么 */
  description: string
  /** 语义模块运行时——承载 moduleKinds、childKinds 等能力树 */
  runtime: ModuleSemanticRuntime
  /** 注册化输入契约；新任务入口用它校验输入、定位实例并生成 LLM 编排规则 */
  inputContract?: AiHostBusinessInputContract
  /** 可选的自定义会话存储；不传则使用 DefaultAiHostSessionStore */
  sessionStore?: AiHostSessionStore
  /**
   * 动态系统提示生成器——每次会话轮次开始前调用，返回值拼接到 LLM 系统消息末尾。
   * 可用于注入当前上下文相关的指引（如当前页面、当前数据源等）。
   */
  systemPrompt?: (context: AiHostBusinessRuntimeContext) => string | undefined
  /**
   * 工具调用后置处理器——LLM 每次完成工具调用后触发。
   * 接收本次调用的上下文（工具名称、参数、返回值），返回生命周期指令。
   * 典型用途：校验结果、追加后续提示、标记步骤完成。
   */
  afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  /** 会话启动回调——AiHostBusiness.createSession() 时调用一次 */
  onStartSession?: (context: AiHostBusinessRuntimeContext) => void | Promise<void>
  /**
   * 业务实例结束回调——AiHostBusiness.endInstance() 时调用。
   * context 提供当前运行时上下文，directive 携带结束指令。
   */
  onEndBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
  /**
   * 模块实例释放回调——业务实例被清理时调用。
   * 用于释放外部系统持有的资源（如关闭 WebSocket、清理临时文件等）。
   */
  releaseModuleInstance?: (moduleInstanceId: string) => void
}>

/* -------------------------------------------------------------------------------
 * 二、注册实例类
 * -------------------------------------------------------------------------------
 * 将注册选项转换为不可变的注册实例。
 * 对外表现为只读属性，内部通过 constructor 完成赋值。
 * 可选回调仅在传入时才挂载（避免 undefined 属性干扰运行时判断）。
 * ----------------------------------------------------------------------------- */

export class AiHostBusinessRegistration {
  /* ── 基础标识 ─────────────────────────────────────────── */

  public readonly moduleId: string
  public readonly name: string
  public readonly description: string

  /* ── 能力运行时 ───────────────────────────────────────── */

  /** 模块语义运行时——工具调用时从中查找 kind、执行 action */
  public readonly runtime: ModuleSemanticRuntime
  /** kindID 的注册化输入契约；由 createAiHostBusinessTask 使用 */
  public readonly inputContract?: AiHostBusinessInputContract

  /* ── 持久化 ───────────────────────────────────────────── */

  /** 会话历史持久化存储 */
  public readonly sessionStore?: AiHostSessionStore

  /* ── 生命周期钩子 ─────────────────────────────────────── */

  /** 系统提示注入 */
  public readonly systemPrompt?: (context: AiHostBusinessRuntimeContext) => string | undefined
  /** 工具调用后处理 */
  public readonly afterFunctionCall?: (
    options: AiHostBusinessAfterFunctionCallOptions,
  ) => AiHostBusinessLifecycleDirective | Promise<AiHostBusinessLifecycleDirective>
  /** 会话启动 */
  public readonly onStartSession?: (context: AiHostBusinessRuntimeContext) => void | Promise<void>
  /** 业务实例结束 */
  public readonly onEndBusinessInstance?: (
    context: AiHostBusinessRuntimeContext,
    directive: AiHostBusinessLifecycleDirective,
  ) => void | Promise<void>
  /** 资源释放 */
  public readonly releaseModuleInstance?: (moduleInstanceId: string) => void

  /* ── 构造函数 ─────────────────────────────────────────── */

  public constructor(options: AiHostBusinessRegistrationOptions) {
    this.moduleId = options.moduleId
    this.name = options.name
    this.description = options.description
    this.runtime = options.runtime
    // 可选字段仅在传入时才挂载——保持 undefined 语义一致
    if (options.inputContract !== undefined) this.inputContract = options.inputContract
    if (options.sessionStore !== undefined) this.sessionStore = options.sessionStore
    if (options.systemPrompt !== undefined) this.systemPrompt = options.systemPrompt
    if (options.afterFunctionCall !== undefined) this.afterFunctionCall = options.afterFunctionCall
    if (options.onStartSession !== undefined) this.onStartSession = options.onStartSession
    if (options.onEndBusinessInstance !== undefined) this.onEndBusinessInstance = options.onEndBusinessInstance
    if (options.releaseModuleInstance !== undefined) this.releaseModuleInstance = options.releaseModuleInstance
  }
}
