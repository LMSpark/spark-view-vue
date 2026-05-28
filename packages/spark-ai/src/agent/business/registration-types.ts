/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  AI HOST · 业务注册合约                                                      │
 * │  Business Registration Contract                                              │
 * │                                                                              │
 * │  本文件定义业务接入 AI Host 的注册入口——外部系统将自身能力封装为                │
 * │  AiModuleRuntime 后，投影成 AiAgentRegistration，再交给 AiAgentHost              │
 * │  register/ensure 按 alias 暴露给业务层运行。                                     │
 * │                                                                              │
 * │  数据流向：                                                                   │
 * │    外部系统 ──(封装)──> AiModuleRuntime                                  │
 * │                    ──(包装)──> AiAgentRegistration                     │
 * │                    ──(注册)──> AiAgentHost.register/ensure ──> AiAgentBusiness  │
 * │                    ──(驱动)──> AiAgentToolLoopRunner ──> LLM                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

import type { AiModuleRuntime } from '../../modules/runtime/ai-module-runtime'
import type { AiJsonParams } from '../../json'
import type { AiAgentSessionStore } from '../session/session-types'
import type { AiAgentInputContract } from './business-task'
import type {
  AiAgentAfterFunctionCallOptions,
  AiAgentBeforeFunctionCallDirective,
  AiAgentBeforeFunctionCallOptions,
  AiAgentLifecycleDirective,
} from './lifecycle-types'
import type { AiAgentRuntimeContext } from './scope-types'

/* -------------------------------------------------------------------------------
 * 一、注册参数类型
 * -------------------------------------------------------------------------------
 * 创建 AiAgentRegistration 实例时传入的配置对象。
 * 所有回调函数均为可选——不传则跳过对应生命周期节点。
 * ----------------------------------------------------------------------------- */

export type AiAgentRegistrationOptions<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  /** 业务模块唯一标识，对应 AiModuleRuntime.moduleId */
  moduleId: string
  /** 面向 LLM 的业务名称，出现在系统提示中 */
  name: string
  /** 面向 LLM 的业务描述，说明该业务能做什么 */
  description: string
  /** 语义模块运行时——承载 moduleKinds、childKinds 等能力树 */
  runtime: AiModuleRuntime
  /** 注册化输入契约；新任务入口用它校验输入、定位实例并生成 LLM 编排规则 */
  inputContract?: AiAgentInputContract<TInput>
  /** 会话历史持久化存储；必须显式注入，registry 不再自动创建默认 store。 */
  sessionStore: AiAgentSessionStore
  /**
   * 动态系统提示生成器——每次会话轮次开始前调用，返回值拼接到 LLM 系统消息末尾。
   * 可用于注入当前上下文相关的指引（如当前页面、当前数据源等）。
   */
  systemPrompt?: (context: AiAgentRuntimeContext) => string | undefined
  /**
   * 工具调用前置处理器——runtime.executeTool 前触发。
   * 典型用途：人工审批、权限策略、只读/危险操作拦截。reject/abort 不会执行 runtime 工具。
   */
  beforeFunctionCall?: (
    options: AiAgentBeforeFunctionCallOptions,
  ) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
  /**
   * 工具调用后置处理器——LLM 每次完成工具调用后触发。
   * 接收本次调用的上下文（工具名称、参数、返回值），返回生命周期指令。
   * 典型用途：校验结果、追加后续提示、标记步骤完成。
   */
  afterFunctionCall?: (
    options: AiAgentAfterFunctionCallOptions,
  ) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
  /** 会话启动回调——AiAgentBusiness.createSession() 时调用一次 */
  onStartSession?: (context: AiAgentRuntimeContext) => void | Promise<void>
  /**
   * 业务实例结束回调——AiAgentBusiness.endInstance() 时调用。
   * context 提供当前运行时上下文，directive 携带结束指令。
   */
  onEndBusinessInstance?: (
    context: AiAgentRuntimeContext,
    directive: AiAgentLifecycleDirective,
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

export class AiAgentRegistration<TInput extends AiJsonParams = AiJsonParams> {
  /* ── 基础标识 ─────────────────────────────────────────── */

  public readonly moduleId: string
  public readonly name: string
  public readonly description: string

  /* ── 能力运行时 ───────────────────────────────────────── */

  /** 模块语义运行时——工具调用时从中查找 kind、执行 function */
  public readonly runtime: AiModuleRuntime
  /** kindID 的注册化输入契约；由 host.run[alias]() 的内部 task 创建使用 */
  public readonly inputContract?: AiAgentInputContract<TInput>

  /* ── 持久化 ───────────────────────────────────────────── */

  /** 会话历史持久化存储 */
  public readonly sessionStore: AiAgentSessionStore

  /* ── 生命周期钩子 ─────────────────────────────────────── */

  /** 系统提示注入 */
  public readonly systemPrompt?: (context: AiAgentRuntimeContext) => string | undefined
  /** 工具调用前处理 */
  public readonly beforeFunctionCall?: (
    options: AiAgentBeforeFunctionCallOptions,
  ) => AiAgentBeforeFunctionCallDirective | Promise<AiAgentBeforeFunctionCallDirective>
  /** 工具调用后处理 */
  public readonly afterFunctionCall?: (
    options: AiAgentAfterFunctionCallOptions,
  ) => AiAgentLifecycleDirective | Promise<AiAgentLifecycleDirective>
  /** 会话启动 */
  public readonly onStartSession?: (context: AiAgentRuntimeContext) => void | Promise<void>
  /** 业务实例结束 */
  public readonly onEndBusinessInstance?: (
    context: AiAgentRuntimeContext,
    directive: AiAgentLifecycleDirective,
  ) => void | Promise<void>
  /** 资源释放 */
  public readonly releaseModuleInstance?: (moduleInstanceId: string) => void

  /* ── 构造函数 ─────────────────────────────────────────── */

  public constructor(options: AiAgentRegistrationOptions<TInput>) {
    this.moduleId = options.moduleId
    this.name = options.name
    this.description = options.description
    this.runtime = options.runtime
    // 可选字段仅在传入时才挂载——保持 undefined 语义一致
    if (options.inputContract !== undefined) this.inputContract = options.inputContract
    this.sessionStore = options.sessionStore
    if (options.systemPrompt !== undefined) this.systemPrompt = options.systemPrompt
    if (options.beforeFunctionCall !== undefined) this.beforeFunctionCall = options.beforeFunctionCall
    if (options.afterFunctionCall !== undefined) this.afterFunctionCall = options.afterFunctionCall
    if (options.onStartSession !== undefined) this.onStartSession = options.onStartSession
    if (options.onEndBusinessInstance !== undefined) this.onEndBusinessInstance = options.onEndBusinessInstance
    if (options.releaseModuleInstance !== undefined) this.releaseModuleInstance = options.releaseModuleInstance
  }
}
