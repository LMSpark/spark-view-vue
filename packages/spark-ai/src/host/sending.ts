/**
 * 框架无关的 AI Host 消息发送逻辑。
 */

import { ModuleSemanticToolCodec } from '../module-semantic/host/module-semantic-tool-codec'
import { AiHostToolLoopRunner } from './tool-loop'
import { createAiHostBusinessScope, createAiHostBusinessStorageKey, normalizeAiHostBusinessTarget, toAiHostRuntimeScope } from './scope'
import { latestUserInput, normalizeTurn } from './turn-utils'
import type {
  AiHostBusinessRegistration,
  AiHostBusinessRuntimeContext,
  AiHostBusinessScope,
  AiHostBusinessSession,
  AiHostBusinessTarget,
  AiHostChatRequest,
  AiHostOptions,
  AiHostSelectedBusiness,
  AiHostStartSessionResult,
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

function isSameScope(left: AiHostBusinessScope, right: AiHostBusinessScope): boolean {
  return left.businessRegistrationId === right.businessRegistrationId
    && left.businessInstanceId === right.businessInstanceId
    && left.instanceId === right.instanceId
}

export class AiHostMessageSender {
  private readonly toolLoopRunner: AiHostToolLoopRunner

  public constructor(private readonly options: AiHostOptions) {
    this.toolLoopRunner = new AiHostToolLoopRunner(options)
  }

  public async send(input: AiHostSendInput, ctx: AiHostSendContext): Promise<void> {
    const { request, turn, scope } = input
    const selected = await this.resolveSelectedBusiness(scope, ctx)
    ctx.setSelected(selected)

    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      ctx.appendUserMessage(toAiHostRuntimeScope(selected.scope), latestUser)
    }

    await this.toolLoopRunner.runToolLoop(
      selected.registration,
      selected.scope,
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
    const registration = this.options.registry.get(scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${scope.businessRegistrationId}`)
    }
    await startRegistrationSession(registration, toAiHostRuntimeScope(scope))
    return { registration, scope }
  }
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

  const resolveRegistration = () => {
    const registration = options.registry.get(scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${scope.businessRegistrationId}`)
    }
    return registration
  }

  const start = async (): Promise<void> => {
    if (selected !== null && isSameScope(selected.scope, scope)) return
    const registration = resolveRegistration()
    await startRegistrationSession(registration, toAiHostRuntimeScope(scope))
    selected = { registration, scope }
  }

  const getSessionRecord = () => {
    const registration = selected?.registration ?? options.registry.get(scope.businessRegistrationId)
    return registration?.sessionStore?.getSession(toAiHostRuntimeScope(scope)) ?? null
  }

  const send = async (request: AiHostChatRequest): Promise<void> => {
    const sendCtx: AiHostSendContext = {
      get selected() { return selected },
      clearSelected,
      setSelected: (next) => {
        selected = next
      },
      appendUserMessage: (runtimeScope, content) => {
        selected?.registration.sessionStore?.appendMessage({
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
