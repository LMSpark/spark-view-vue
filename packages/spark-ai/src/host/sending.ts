/**
 * 框架无关的 AI Host 消息发送逻辑。
 *
 * 职责：管理业务会话的生命周期，执行单次消息发送并进入工具调用循环。
 * 不依赖 Vue/React/Angular。
 *
 * 核心流程（AiHostMessageSender.send）：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 1. resolveSelectedBusiness() → 查找/启动业务运行时            │
 * │    ├─ 检查缓存：已选中且 scope 相同 → 直接复用                │
 * │    ├─ 从 registry.get() 查找运行时                            │
 * │    └─ runtime.startSession() → 获取知识投影                   │
 * │                                                               │
 * │ 2. 提取最新用户消息 → appendUserMessage() 追加到会话           │
 * │                                                               │
 * │ 3. toolLoopRunner.runToolLoop() → 进入工具调用循环            │
 * │    ├─ 编码工具 → SSE 请求 LLM → 处理回复 → 执行工具 → 循环    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * createAiHostBusinessSession() 流程：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 创建持久会话对象，包含 start() / send() / getSessionRecord()  │
 * │ 内部通过闭包维护 selected 状态，复用 AiHostMessageSender       │
 * └──────────────────────────────────────────────────────────────┘
 */

import { AiHostToolLoopRunner } from './tool-loop'
import { createAiHostBusinessScope, createAiHostBusinessStorageKey, normalizeAiHostBusinessTarget, toAiHostRuntimeScope } from './scope'
import { latestUserInput, normalizeTurn } from './turn-utils'
import type {
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessSession,
  AiHostBusinessTarget,
  AiHostChatRequest,
  AiHostOptions,
  AiHostSelectedBusiness,
  AiHostTurnMeta,
} from './types'

// ═══════════════════════════════════════════════════════
// 发送输入 & 上下文
// ═══════════════════════════════════════════════════════

/** 单次消息发送的输入参数 */
export interface AiHostSendInput {
  /** 聊天请求，包含历史消息和回调 */
  readonly request: AiHostChatRequest
  /** Turn 轮次元信息 */
  readonly turn: AiHostTurnMeta
  /** 业务作用域 */
  readonly scope: AiHostBusinessScope
}

/** 发送上下文，由调用方提供，用于管理选中状态和追加消息 */
export interface AiHostSendContext {
  /** 当前已选中的业务运行时（可能为 null） */
  selected: AiHostSelectedBusiness | null
  /** 清除已选中的业务运行时缓存 */
  clearSelected(): void
  /** 设置已选中的业务运行时 */
  setSelected(selected: AiHostSelectedBusiness): void
  /** 将用户消息追加到会话历史 */
  appendUserMessage(scope: AiHostBusinessRuntimeContext, content: string): void
}

// ═══════════════════════════════════════════════════════
// 作用域比较
// ═══════════════════════════════════════════════════════

/**
 * 比较两个作用域是否相等。
 * 仅当 businessRegistrationId、businessInstanceId 和 instanceId 全部相同时返回 true。
 */
function isSameScope(left: AiHostBusinessScope, right: AiHostBusinessScope): boolean {
  return left.businessRegistrationId === right.businessRegistrationId
    && left.businessInstanceId === right.businessInstanceId
    && left.instanceId === right.instanceId
}

// ═══════════════════════════════════════════════════════
// 消息发送器
// ═══════════════════════════════════════════════════════

/**
 * AI Host 消息发送器。
 * 负责单次消息发送的完整流程：解析运行时 → 追加用户消息 → 进入工具循环。
 */
export class AiHostMessageSender {
  private readonly toolLoopRunner: AiHostToolLoopRunner

  constructor(private readonly options: AiHostOptions) {
    this.toolLoopRunner = new AiHostToolLoopRunner(options)
  }

  /**
   * 执行单次消息发送。
   *
   * 流程：
   * 1. 解析并选中业务运行时（查找 registry → startSession → 获取投影）
   * 2. 从请求中提取最新用户消息 → 追加到会话历史
   * 3. 进入工具调用循环（LLM 回复 → 工具调用 → 生命周期判断 → 继续/终止）
   */
  async send(input: AiHostSendInput, ctx: AiHostSendContext): Promise<void> {
    const { request, turn, scope } = input
    const selected = await this.resolveSelectedBusiness(scope, ctx)

    ctx.setSelected(selected)

    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      ctx.appendUserMessage(toAiHostRuntimeScope(selected.scope), latestUser)
    }

    await this.toolLoopRunner.runToolLoop(
      selected.runtime,
      selected.scope,
      selected.projection,
      request,
      turn,
      ctx.clearSelected,
    )
  }

  /**
   * 解析并选中业务运行时。
   *
   * 流程：
   * 1. 检查缓存：已选中且 scope 相同 → 直接复用
   * 2. 清除旧缓存
   * 3. 从 registry 查找运行时，未找到则抛出异常
   * 4. 调用 runtime.startSession() 获取知识投影
   * 5. 返回包含 runtime、scope 和 projection 的选中对象
   */
  private async resolveSelectedBusiness(
    scope: AiHostBusinessScope,
    ctx: AiHostSendContext,
  ): Promise<AiHostSelectedBusiness> {
    if (ctx.selected !== null && isSameScope(ctx.selected.scope, scope)) {
      return ctx.selected
    }
    ctx.clearSelected()
    const runtime = this.options.registry.get(scope.businessRegistrationId)
    if (runtime === undefined) {
      throw new Error(`AI business runtime is not registered: ${scope.businessRegistrationId}`)
    }
    const projection = await runtime.startSession(toAiHostRuntimeScope(scope))
    return {
      runtime,
      scope,
      projection,
    }
  }
}

// ═══════════════════════════════════════════════════════
// 业务会话工厂
// ═══════════════════════════════════════════════════════

/**
 * 创建持久化的 AI 业务会话。
 *
 * 返回 AiHostBusinessSession 对象，包含：
 * - start(): 启动会话（查找 runtime → startSession）
 * - send(): 发送聊天请求（进入工具调用循环）
 * - getSessionRecord(): 获取当前会话记录
 *
 * 内部通过闭包维护 selected 状态，复用 AiHostMessageSender 执行发送。
 * 每次 send() 调用都会先检查缓存，避免重复 startSession。
 */
export function createAiHostBusinessSession(
  options: AiHostOptions,
  targetInput: AiHostBusinessTarget,
): AiHostBusinessSession {
  const target = normalizeAiHostBusinessTarget(targetInput)
  const scope = createAiHostBusinessScope(target.businessRegistrationId, target.businessInstanceId)
  const storageKey = createAiHostBusinessStorageKey(scope)
  const senderCore = new AiHostMessageSender(options)
  let selected: AiHostSelectedBusiness | null = null

  /** 清除选中的业务运行时缓存 */
  const clearSelected = () => {
    selected = null
  }

  /** 从 registry 查找业务运行时，未找到则抛出 */
  const resolveRuntime = () => {
    const runtime = options.registry.get(scope.businessRegistrationId)
    if (runtime === undefined) {
      throw new Error(`AI business runtime is not registered: ${scope.businessRegistrationId}`)
    }
    return runtime
  }

  /** 启动/复用会话：检查缓存 → 查找 runtime → startSession */
  const start = async (): Promise<void> => {
    if (selected !== null && isSameScope(selected.scope, scope)) return
    const runtime = resolveRuntime()
    selected = {
      runtime,
      scope,
      projection: await runtime.startSession(toAiHostRuntimeScope(scope)),
    }
  }

  /** 获取当前会话记录；优先使用已选中的 runtime，否则从 registry 查找 */
  const getSessionRecord = () => {
    const runtime = selected?.runtime ?? options.registry.get(scope.businessRegistrationId)
    return runtime?.getSession?.(toAiHostRuntimeScope(scope)) ?? null
  }

  /** 发送聊天请求：构建 SendContext → 调用 senderCore.send() → 进入工具循环 */
  const send = async (request: AiHostChatRequest): Promise<void> => {
    const sendCtx: AiHostSendContext = {
      get selected() { return selected },
      clearSelected,
      setSelected: (next) => {
        selected = next
      },
      appendUserMessage: (runtimeScope: AiHostBusinessRuntimeContext, content: string) => {
        const runtime = selected?.runtime
        if (runtime === undefined) return
        runtime.appendMessage({
          ...runtimeScope,
          role: 'user',
          content,
          source: 'ui',
        })
      },
    }
    await senderCore.send({
      request,
      turn: request.turn ?? normalizeTurn(request),
      scope,
    }, sendCtx)
  }

  return {
    target,
    scope,
    storageKey,
    sessionId: scope.instanceId,
    pageId: target.businessInstanceId,
    sender: send,
    start,
    getSessionRecord,
    send,
  }
}
