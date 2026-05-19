/**
 * 框架无关的 AI Host 消息发送逻辑。
 *
 * 核心流程：使用显式业务 scope → 启动/复用会话 → 追加用户消息 → 运行工具调用循环。
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

export function createAiHostBusinessSession(
  options: AiHostOptions,
  targetInput: AiHostBusinessTarget,
): AiHostBusinessSession {
  const target = normalizeAiHostBusinessTarget(targetInput)
  const scope = createAiHostBusinessScope(target.businessRegistrationId, target.businessInstanceId)
  const storageKey = createAiHostBusinessStorageKey(scope)
  const senderCore = new AiHostMessageSender(options)
  let selected: AiHostSelectedBusiness | null = null

  const clearSelected = () => {
    selected = null
  }

  const resolveRuntime = () => {
    const runtime = options.registry.get(scope.businessRegistrationId)
    if (runtime === undefined) {
      throw new Error(`AI business runtime is not registered: ${scope.businessRegistrationId}`)
    }
    return runtime
  }

  const start = async (): Promise<void> => {
    if (selected !== null && isSameScope(selected.scope, scope)) return
    const runtime = resolveRuntime()
    selected = {
      runtime,
      scope,
      projection: await runtime.startSession(toAiHostRuntimeScope(scope)),
    }
  }

  const getSessionRecord = () => {
    const runtime = selected?.runtime ?? options.registry.get(scope.businessRegistrationId)
    return runtime?.getSession?.(toAiHostRuntimeScope(scope)) ?? null
  }

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
