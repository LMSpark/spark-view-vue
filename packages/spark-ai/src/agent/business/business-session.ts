/**
 * ═══════════════════════════════════════════════════════════════
 * agent/business/business-session.ts — 业务会话管理
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的会话编排核心。连接业务注册、会话存储、工具循环
 *   和 AI 传输层，形成完整的"用户发消息→AI 推理→工具调用→结果返回"闭环。
 *
 * 【核心类】
 *   AiAgentSession  — Host 内部业务会话
 *     ├─ 持有 AiAgentMessageSender（消息发送编排）
 *     │    └─ 持有 AiAgentToolLoopRunner（工具循环执行）
 *     └─ 持有 AiAgentMessageSendState（选中业务缓存）
 *
 * 【数据流】
 *   1. host.run[alias](input) → 解析 alias 并创建内部 task
 *   2. new AiAgentSession(options, task.target)
 *   3. session.start()  → startAiAgentRegistrationSession() → 创建/接入 sessionStore 记录 + 生成工具规约
 *   4. session.send(task.toChatRequest()) → senderCore.send()
 *      ├─ resolveSelectedBusiness() → 查找/复用 registration
 *      ├─ latestUserInput() → 提取用户消息 → appendMessage('user')
 *      └─ toolLoopRunner.runToolLoop() → AI 推理 → 工具调用 → 生命周期判断
 *   5. 会话结束 → stopSession() → onEndBusinessInstance() → releaseModuleInstance()
 *
 * 【独立函数】
 *   runAiAgent           — AiAgent 门面使用的一站式内部运行函数
 *   createAiAgentSession — 内部会话工厂函数
 *   startAiAgentRegistrationSession    — 启动注册会话（创建/接入 sessionStore 记录 + 固定工具规约）
 *
 * 【消费方】Host 初始化代码、页面级 AI 助手入口
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiJsonParams } from '../../json'
import { AiAgentToolLoopRunner } from '../tool-loop/tool-loop-runner'
import {
  createAiAgentScope,
  createAiAgentSessionId,
  latestUserInput,
  normalizeAiAgentTarget,
  toAiAgentRuntimeScope,
} from './business-scope'
import type { AiAgentChatRequest, AiAgentTurnMeta } from '../chat/chat-types'
import type { AiAgentSessionRecord, AiAgentStartSessionResult } from '../session/session-types'
import {
  createAiAgentTask,
  type AiAgentTask,
  type AiAgentTaskChatOptions,
} from './business-task'
import type { AiAgentOptions } from './host-options'
import type { AiAgentRegistration } from './registration-types'
import type {
  AiAgentRuntimeContext,
  AiAgentScope,
  AiAgentTarget,
} from './scope-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 内部类型
// ═══════════════════════════════════════════════════════════════

/** 消息发送的输入参数 */
type AiAgentSendInput = Readonly<{
  request: AiAgentChatRequest
  turn: AiAgentTurnMeta
  scope: AiAgentScope
}>

export type AiAgentRunCommand<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  options: AiAgentOptions<TInput>
  kindID: string
  input: TInput
  chat?: AiAgentTaskChatOptions
}>

export type AiAgentRunResult<TInput extends AiJsonParams = AiJsonParams> = Readonly<{
  task: AiAgentTask<TInput>
  session: AiAgentSession
}>

/** 选中的业务（registration + scope 对） */
class SelectedAiAgentBusiness {
  public constructor(
    public readonly registration: AiAgentRegistration,
    public readonly scope: AiAgentScope,
  ) {}
}

// ═══════════════════════════════════════════════════════════════
// 第 2 节 · 消息发送状态管理
// ═══════════════════════════════════════════════════════════════

/**
 * 消息发送状态。
 * 缓存当前选中的业务，避免每次 send 都重新查找 registration。
 * 场景切换时（scope 变化）自动清除缓存并重新选择。
 */
class AiAgentMessageSendState {
  private selectedBusiness: SelectedAiAgentBusiness | null = null

  public get selected(): SelectedAiAgentBusiness | null {
    return this.selectedBusiness
  }

  /** 清除选中状态（业务切换时调用） */
  public clearSelected = (): void => {
    this.selectedBusiness = null
  }

  /** 设置选中业务 */
  public setSelected(registration: AiAgentRegistration, scope: AiAgentScope): void {
    this.selectedBusiness = new SelectedAiAgentBusiness(registration, scope)
  }

  /** 向当前选中业务的 sessionStore 追加用户消息 */
  public appendUserMessage(scope: AiAgentRuntimeContext, content: string): void {
    this.selectedBusiness?.registration.sessionStore.appendMessage({
      ...scope,
      role: 'user',
      content,
      source: 'ui',
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 3 节 · 辅助函数
// ═══════════════════════════════════════════════════════════════

/** 判定两个 scope 是否指向同一个业务实例 */
function isSameScope(left: AiAgentScope, right: AiAgentScope): boolean {
  return left.businessRegistrationId === right.businessRegistrationId
    && left.businessInstanceId === right.businessInstanceId
    && left.instanceId === right.instanceId
}

/** 规范化 turn 元数据：生成 turnId、记录时间戳 */
function normalizeTurn(request: AiAgentChatRequest): AiAgentTurnMeta {
  const now = new Date().toISOString()
  return {
    turnId: globalThis.crypto.randomUUID(),
    seq: 1,
    baseRevision: Math.max(0, request.historyMsgs.length - 1),
    queuedAt: now,
    startedAt: now,
    maxParallelTurns: 1,
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 4 节 · 消息发送编排
// ═══════════════════════════════════════════════════════════════

/**
 * 消息发送编排器。
 * 负责：解析 scope → 查找 registration → 提取用户消息 → 启动工具循环。
 */
class AiAgentMessageSender {
  private readonly toolLoopRunner: AiAgentToolLoopRunner

  public constructor(private readonly options: AiAgentOptions) {
    this.toolLoopRunner = new AiAgentToolLoopRunner(options.turnCallbacks, options.maxToolRounds)
  }

  /** 发送消息的主入口 */
  public async send(input: AiAgentSendInput, state: AiAgentMessageSendState): Promise<void> {
    const { request, turn, scope } = input
    const selected = await this.resolveSelectedBusiness(scope, state)
    state.setSelected(selected.registration, selected.scope)

    // 提取最新用户消息并写入 sessionStore
    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      state.appendUserMessage(toAiAgentRuntimeScope(selected.scope), latestUser)
    }

    // 启动工具循环（AI 推理 + 工具调用 + 生命周期判断）
    await this.toolLoopRunner.runToolLoop({
      registration: selected.registration,
      scope: selected.scope,
      request,
      turn,
      clearSelected: state.clearSelected,
    })
  }

  /**
   * 解析选中的业务。
   * 若当前缓存的 scope 匹配 → 复用；
   * 否则清除缓存 → 从 registry 重新查找 → 启动注册会话。
   */
  private async resolveSelectedBusiness(
    scope: AiAgentScope,
    state: AiAgentMessageSendState,
  ): Promise<SelectedAiAgentBusiness> {
    if (state.selected !== null && isSameScope(state.selected.scope, scope)) {
      return state.selected
    }
    state.clearSelected()
    const registration = this.options.registry.get(scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${scope.businessRegistrationId}`)
    }
    await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(scope))
    return new SelectedAiAgentBusiness(registration, scope)
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 业务会话
// ═══════════════════════════════════════════════════════════════

/**
 * 业务会话。
 *
 * 业务层推荐通过 AiAgent.run[alias](input) 进入；本类承载 Host 内部 session 状态。
 *
 * 属性：
 *   target     — 业务定位
 *   scope      — 业务作用域
 *   sessionId  — 后端会话 ID（kind + 顶层实例 ID）
 */
// PAGE_DESIGN_AI_TRACE[host-session-entry]: pageDesign live LLM 评测经 AiAgent.run 进入 AI Host 会话线；清理冗余时保留这一处作为前端 AI 会话入口。
// PAGE_DESIGN_REFACTOR_SOURCE[host-session-entry]: 前端 Agent 会话入口；sessionId 来自 kind + instanceId，turn 隔离在 send/transport 层继续传递。
export class AiAgentSession {
  public readonly target: AiAgentTarget
  public readonly scope: AiAgentScope
  public readonly sessionId: string

  private readonly senderCore: AiAgentMessageSender
  private readonly state = new AiAgentMessageSendState()

  public constructor(
    private readonly options: AiAgentOptions,
    targetInput: AiAgentTarget,
  ) {
    this.target = normalizeAiAgentTarget(targetInput)
    this.scope = createAiAgentScope(this.target.businessRegistrationId, this.target.businessInstanceId)
    this.sessionId = createAiAgentSessionId(this.target.businessRegistrationId, this.target.businessInstanceId)
    this.senderCore = new AiAgentMessageSender(options)
  }

  /** 启动会话：创建/接入 sessionStore 记录 + 生成工具规约 */
  public async start(): Promise<void> {
    if (this.state.selected !== null && isSameScope(this.state.selected.scope, this.scope)) return
    const registration = this.resolveRegistration()
    await startAiAgentRegistrationSession(registration, toAiAgentRuntimeScope(this.scope))
    this.state.setSelected(registration, this.scope)
  }

  /** 获取当前会话记录：Agent 能力诊断和再次接入会话的读取起点 */
  public getSessionRecord(): AiAgentSessionRecord | null {
    const registration = this.state.selected?.registration
      ?? this.options.registry.get(this.scope.businessRegistrationId)
    return registration?.sessionStore.getSession(toAiAgentRuntimeScope(this.scope)) ?? null
  }

  /** 发送消息：提取用户输入 → AI 推理 → 工具调用 */
  public async send(request: AiAgentChatRequest): Promise<void> {
    await this.senderCore.send({
      request,
      turn: request.turn ?? normalizeTurn(request),
      scope: this.scope,
    }, this.state)
  }

  /** 从 registry 查找当前 scope 对应的 registration */
  private resolveRegistration(): AiAgentRegistration {
    const registration = this.options.registry.get(this.scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${this.scope.businessRegistrationId}`)
    }
    return registration
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 6 节 · 工厂函数与会话启动
// ═══════════════════════════════════════════════════════════════

/** 工厂函数：创建业务会话 */
export function createAiAgentSession(
  options: AiAgentOptions,
  targetInput: AiAgentTarget,
): AiAgentSession {
  return new AiAgentSession(options, targetInput)
}

/**
 * 一站式运行已注册业务。
 *
 * 用于 AiAgent 门面按 alias 解析出 kindID 后，创建 task、启动 session 并发送首轮请求。
 */
export async function runAiAgent<TInput extends AiJsonParams = AiJsonParams>(
  command: AiAgentRunCommand<TInput>,
): Promise<AiAgentRunResult<TInput>> {
  const task = createAiAgentTask(command.options.registry, command.kindID, command.input)
  const session = createAiAgentSession(command.options, task.target)
  await session.start()
  await session.send(task.toChatRequest(command.chat))
  return { task, session }
}

/**
 * 启动注册会话。
 *
 * 执行步骤：
 * 1. 调用 registration.onStartSession() 生命周期回调
 * 2. 调用 sessionStore.startSession() 创建会话记录
 * 3. 直接使用 AiModuleRuntime 固定协议工具规约
 * 4. 返回 AiAgentStartSessionResult（含 session + tools）
 */
// PAGE_DESIGN_AI_TRACE[agent-session-start]: startAiAgentRegistrationSession 负责调用业务 onStartSession 并投影 modules 固定工具；pageDesign 的工具列表从这里进入 LLM。
// PAGE_DESIGN_REFACTOR_SOURCE[tool-schema-projection]: modules 工具投影成 LLM function schema 的源头；不要在业务 mjs 中手写工具 schema。
export async function startAiAgentRegistrationSession<TInput extends AiJsonParams>(
  registration: AiAgentRegistration<TInput>,
  context: AiAgentRuntimeContext,
): Promise<AiAgentStartSessionResult> {
  const sessionStore = registration.sessionStore
  await registration.onStartSession?.(context)
  const session = sessionStore.startSession(context)
  const tools = registration.runtime.getTools()
  return {
    status: 'Started',
    instanceId: context.instanceId,
    moduleId: context.moduleId,
    moduleInstanceId: context.moduleInstanceId,
    session,
    tools,
  }
}
