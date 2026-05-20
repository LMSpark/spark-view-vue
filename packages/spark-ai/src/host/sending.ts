/**
 * 框架无关的 AI Host 消息发送逻辑。
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │                   AiHostMessageSender                         │
 * │                                                              │
 * │  send() ─ 单次消息发送                                       │
 * │    ├─ ① resolveSelectedBusiness() → 查找/启动业务运行时       │
 * │    ├─ ② 提取最新用户消息 → appendUserMessage()                │
 * │    └─ ③ toolLoopRunner.runToolLoop() → 进入工具循环            │
 * │                                                              │
 * │  createAiHostBusinessSession() ─ 创建持久会话                  │
 * │    ├─ 管理 session 生命周期（start / send / getSessionRecord） │
 * │    └─ 内部复用 AiHostMessageSender + AiHostSendContext         │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 核心流程：显式业务 scope → 启动/复用会话 → 追加用户消息 → 运行工具调用循环
 * 不依赖 Vue/React/Angular。
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

export interface AiHostSendInput {
  readonly request: AiHostChatRequest
  readonly turn: AiHostTurnMeta
  readonly scope: AiHostBusinessScope
}

export interface AiHostSendContext {
  selected: AiHostSelectedBusiness | null
  clearSelected(): void
  setSelected(selected: AiHostSelectedBusiness): void
  appendUserMessage(scope: AiHostBusinessRuntimeContext, content: string): void
}

export class AiHostMessageSender {
  private readonly toolLoopRunner: AiHostToolLoopRunner

  constructor(private readonly options: AiHostOptions) {
    this.toolLoopRunner = new AiHostToolLoopRunner(options)
  }

  /**
   * 执行单次消息发送。
   * 流程：解析业务运行时 → 设置选中状态 → 提取用户消息 → 进入工具循环。
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
   * 流程：检查缓存 → 从 registry 查找 → 调用 runtime.startSession() → 缓存结果。
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

function isSameScope(left: AiHostBusinessScope, right: AiHostBusinessScope): boolean {
  return left.businessRegistrationId === right.businessRegistrationId
    && left.businessInstanceId === right.businessInstanceId
    && left.instanceId === right.instanceId
}

/**
 * 创建持久化的 AI 业务会话。
 * 返回 AiHostBusinessSession 对象，包含 start() / send() / getSessionRecord() 方法。
 * 内部通过闭包维护 selected 状态，复用 AiHostMessageSender 执行发送。
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

  /** 获取当前会话记录；优先使用已选中的 runtime */
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
