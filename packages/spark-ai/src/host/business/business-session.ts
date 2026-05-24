/**
 * ═══════════════════════════════════════════════════════════════
 * host/business/business-session.ts — 业务会话管理
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】Host 层的会话编排核心。连接业务注册、会话存储、工具循环
 *   和 AI 传输层，形成完整的"用户发消息→AI 推理→工具调用→结果返回"闭环。
 *
 * 【核心类】
 *   AiHostBusinessSession  — 业务会话（对外 API）
 *     ├─ 持有 AiHostMessageSender（消息发送编排）
 *     │    └─ 持有 AiHostToolLoopRunner（工具循环执行）
 *     └─ 持有 AiHostMessageSendState（选中业务缓存）
 *
 * 【数据流】
 *   1. createAiHostBusinessTask(registry, kindID, input) → inputContract 校验并生成 target/request
 *   2. new AiHostBusinessSession(options, task.target)
 *   3. session.start()  → startRegistrationSession() → 创建/接入 sessionStore 记录 + 生成工具规约
 *   4. session.send(task.toChatRequest()) → senderCore.send()
 *      ├─ resolveSelectedBusiness() → 查找/复用 registration
 *      ├─ latestUserInput() → 提取用户消息 → appendMessage('user')
 *      └─ toolLoopRunner.runToolLoop() → AI 推理 → 工具调用 → 生命周期判断
 *   5. 会话结束 → stopSession() → onEndBusinessInstance() → releaseModuleInstance()
 *
 * 【独立函数】
 *   createAiHostBusinessSession — 工厂函数
 *   startRegistrationSession    — 启动注册会话（创建/接入 sessionStore 记录 + 编解码器）
 *
 * 【消费方】Host 初始化代码、页面级 AI 助手入口
 * ═══════════════════════════════════════════════════════════════
 */

import { ModuleSemanticToolCodec } from '../../module-semantic/host/module-semantic-tool-codec'
import { AiHostToolLoopRunner } from '../tool-loop/tool-loop-runner'
import {
  createAiHostBusinessScope,
  createAiHostBusinessSessionId,
  createAiHostBusinessStorageKey,
  latestUserInput,
  normalizeAiHostBusinessTarget,
  toAiHostRuntimeScope,
} from './business-scope'
import type { AiHostChatRequest, AiHostTurnMeta } from '../chat/chat-types'
import type { AiHostSessionRecord, AiHostStartSessionResult } from '../session/session-types'
import type {
  AiHostBusinessRegistration,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessTarget,
  AiHostOptions,
  AiHostSender,
} from './business-types'

// ═══════════════════════════════════════════════════════════════
// 第 1 节 · 内部类型
// ═══════════════════════════════════════════════════════════════

/** 消息发送的输入参数 */
type AiHostSendInput = Readonly<{
  request: AiHostChatRequest
  turn: AiHostTurnMeta
  scope: AiHostBusinessScope
}>

/** 选中的业务（registration + scope 对） */
class SelectedAiHostBusiness {
  public constructor(
    public readonly registration: AiHostBusinessRegistration,
    public readonly scope: AiHostBusinessScope,
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
class AiHostMessageSendState {
  private selectedBusiness: SelectedAiHostBusiness | null = null

  public get selected(): SelectedAiHostBusiness | null {
    return this.selectedBusiness
  }

  /** 清除选中状态（业务切换时调用） */
  public clearSelected = (): void => {
    this.selectedBusiness = null
  }

  /** 设置选中业务 */
  public setSelected(registration: AiHostBusinessRegistration, scope: AiHostBusinessScope): void {
    this.selectedBusiness = new SelectedAiHostBusiness(registration, scope)
  }

  /** 向当前选中业务的 sessionStore 追加用户消息 */
  public appendUserMessage(scope: AiHostBusinessRuntimeContext, content: string): void {
    this.selectedBusiness?.registration.sessionStore?.appendMessage({
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
function isSameScope(left: AiHostBusinessScope, right: AiHostBusinessScope): boolean {
  return left.businessRegistrationId === right.businessRegistrationId
    && left.businessInstanceId === right.businessInstanceId
    && left.instanceId === right.instanceId
}

/** 规范化 turn 元数据：生成 turnId、记录时间戳 */
function normalizeTurn(request: AiHostChatRequest): AiHostTurnMeta {
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
class AiHostMessageSender {
  private readonly toolLoopRunner: AiHostToolLoopRunner

  public constructor(private readonly options: AiHostOptions) {
    this.toolLoopRunner = new AiHostToolLoopRunner(options.turnCallbacks, options.maxToolRounds)
  }

  /** 发送消息的主入口 */
  public async send(input: AiHostSendInput, state: AiHostMessageSendState): Promise<void> {
    const { request, turn, scope } = input
    const selected = await this.resolveSelectedBusiness(scope, state)
    state.setSelected(selected.registration, selected.scope)

    // 提取最新用户消息并写入 sessionStore
    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      state.appendUserMessage(toAiHostRuntimeScope(selected.scope), latestUser)
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
    scope: AiHostBusinessScope,
    state: AiHostMessageSendState,
  ): Promise<SelectedAiHostBusiness> {
    if (state.selected !== null && isSameScope(state.selected.scope, scope)) {
      return state.selected
    }
    state.clearSelected()
    const registration = this.options.registry.get(scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${scope.businessRegistrationId}`)
    }
    await startRegistrationSession(registration, toAiHostRuntimeScope(scope))
    return new SelectedAiHostBusiness(registration, scope)
  }
}

// ═══════════════════════════════════════════════════════════════
// 第 5 节 · 业务会话（对外 API）
// ═══════════════════════════════════════════════════════════════

/**
 * 业务会话。
 *
 * 用法：
 * ```ts
 * const task = createAiHostBusinessTask(registry, 'pageDesign', { pageId, userRequirement })
 * const session = createAiHostBusinessSession(options, task.target)
 * await session.start()
 * await session.send(task.toChatRequest())
 * ```
 *
 * 属性：
 *   target     — 业务定位
 *   scope      — 业务作用域
 *   storageKey — 存储键（用于持久化和再次接入）
 *   sessionId  — 后端会话 ID（kind + 顶层实例 ID）
 *   pageId     — 页面 ID（= businessInstanceId）
 *   sender     — 消息发送器（可直接传给 UI 层）
 */
// PAGE_DESIGN_AI_TRACE[host-session-entry]: pageDesign live LLM 评测从 createAiHostBusinessSession/start/send 进入 AI Host 会话线；清理冗余时保留这一处作为前端 AI 会话入口。
// PAGE_DESIGN_REFACTOR_SOURCE[host-session-entry]: 前端 Agent 会话入口；sessionId 来自 kind + instanceId，turn 隔离在 send/transport 层继续传递。
export class AiHostBusinessSession {
  public readonly target: AiHostBusinessTarget
  public readonly scope: AiHostBusinessScope
  public readonly storageKey: string
  public readonly sessionId: string
  public readonly pageId: string
  public readonly sender: AiHostSender

  private readonly senderCore: AiHostMessageSender
  private readonly state = new AiHostMessageSendState()

  public constructor(
    private readonly options: AiHostOptions,
    targetInput: AiHostBusinessTarget,
  ) {
    this.target = normalizeAiHostBusinessTarget(targetInput)
    this.scope = createAiHostBusinessScope(this.target.businessRegistrationId, this.target.businessInstanceId)
    this.storageKey = createAiHostBusinessStorageKey(this.scope)
    this.sessionId = createAiHostBusinessSessionId(this.target.businessRegistrationId, this.target.businessInstanceId)
    this.pageId = this.target.businessInstanceId
    this.senderCore = new AiHostMessageSender(options)
    this.sender = (request) => this.send(request)
  }

  /** 启动会话：创建/接入 sessionStore 记录 + 生成工具规约 */
  public async start(): Promise<void> {
    if (this.state.selected !== null && isSameScope(this.state.selected.scope, this.scope)) return
    const registration = this.resolveRegistration()
    await startRegistrationSession(registration, toAiHostRuntimeScope(this.scope))
    this.state.setSelected(registration, this.scope)
  }

  /** 获取当前会话记录：Agent 能力诊断和再次接入会话的读取起点 */
  public getSessionRecord(): AiHostSessionRecord | null {
    const registration = this.state.selected?.registration ?? this.options.registry.get(this.scope.businessRegistrationId)
    return registration?.sessionStore?.getSession(toAiHostRuntimeScope(this.scope)) ?? null
  }

  /** 发送消息：提取用户输入 → AI 推理 → 工具调用 */
  public async send(request: AiHostChatRequest): Promise<void> {
    await this.senderCore.send({
      request,
      turn: request.turn ?? normalizeTurn(request),
      scope: this.scope,
    }, this.state)
  }

  /** 从 registry 查找当前 scope 对应的 registration */
  private resolveRegistration(): AiHostBusinessRegistration {
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
export function createAiHostBusinessSession(
  options: AiHostOptions,
  targetInput: AiHostBusinessTarget,
): AiHostBusinessSession {
  return new AiHostBusinessSession(options, targetInput)
}

/**
 * 启动注册会话。
 *
 * 执行步骤：
 * 1. 调用 registration.onStartSession() 生命周期回调
 * 2. 调用 sessionStore.startSession() 创建会话记录
 * 3. 通过 ModuleSemanticToolCodec 编解码器将协议工具转为 transport 工具规约
 * 4. 返回 AiHostStartSessionResult（含 session + tools）
 */
// PAGE_DESIGN_AI_TRACE[host-session-start]: startRegistrationSession 负责调用业务 onStartSession 并投影 module-semantic 工具；pageDesign 的工具列表从这里进入 LLM。
// PAGE_DESIGN_REFACTOR_SOURCE[tool-schema-projection]: module-semantic 工具投影成 LLM function schema 的源头；不要在业务 mjs 中手写工具 schema。
export async function startRegistrationSession(
  registration: AiHostBusinessRegistration,
  context: AiHostBusinessRuntimeContext,
): Promise<AiHostStartSessionResult> {
  const sessionStore = registration.sessionStore
  if (sessionStore === undefined) {
    throw new Error(`AI host business registration missing sessionStore: ${registration.moduleId}`)
  }
  await registration.onStartSession?.(context)
  const session = sessionStore.startSession(context)
  const tools = new ModuleSemanticToolCodec(registration.runtime.getLlmTools()).tools
  return {
    status: 'Started',
    instanceId: context.instanceId,
    moduleId: context.moduleId,
    moduleInstanceId: context.moduleInstanceId,
    session,
    tools,
  }
}
