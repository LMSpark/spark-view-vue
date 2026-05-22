/**
 * Framework-agnostic AI Host sending and business-session runtime.
 */

import { ModuleSemanticToolCodec } from '../../module-semantic/host/module-semantic-tool-codec'
import { AiHostToolLoopRunner } from '../tool-loop/tool-loop-runner'
import {
  createAiHostBusinessScope,
  createAiHostBusinessStorageKey,
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

type AiHostSendInput = Readonly<{
  request: AiHostChatRequest
  turn: AiHostTurnMeta
  scope: AiHostBusinessScope
}>

class SelectedAiHostBusiness {
  public constructor(
    public readonly registration: AiHostBusinessRegistration,
    public readonly scope: AiHostBusinessScope,
  ) {}
}

class AiHostMessageSendState {
  private selectedBusiness: SelectedAiHostBusiness | null = null

  public get selected(): SelectedAiHostBusiness | null {
    return this.selectedBusiness
  }

  public clearSelected = (): void => {
    this.selectedBusiness = null
  }

  public setSelected(registration: AiHostBusinessRegistration, scope: AiHostBusinessScope): void {
    this.selectedBusiness = new SelectedAiHostBusiness(registration, scope)
  }

  public appendUserMessage(scope: AiHostBusinessRuntimeContext, content: string): void {
    this.selectedBusiness?.registration.sessionStore?.appendMessage({
      ...scope,
      role: 'user',
      content,
      source: 'ui',
    })
  }
}

function isSameScope(left: AiHostBusinessScope, right: AiHostBusinessScope): boolean {
  return left.businessRegistrationId === right.businessRegistrationId
    && left.businessInstanceId === right.businessInstanceId
    && left.instanceId === right.instanceId
}

function latestUserInput(request: AiHostChatRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}

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

class AiHostMessageSender {
  private readonly toolLoopRunner: AiHostToolLoopRunner

  public constructor(private readonly options: AiHostOptions) {
    this.toolLoopRunner = new AiHostToolLoopRunner(options)
  }

  public async send(input: AiHostSendInput, state: AiHostMessageSendState): Promise<void> {
    const { request, turn, scope } = input
    const selected = await this.resolveSelectedBusiness(scope, state)
    state.setSelected(selected.registration, selected.scope)

    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      state.appendUserMessage(toAiHostRuntimeScope(selected.scope), latestUser)
    }

    await this.toolLoopRunner.runToolLoop(
      selected.registration,
      selected.scope,
      request,
      turn,
      state.clearSelected,
    )
  }

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
    this.sessionId = this.scope.instanceId
    this.pageId = this.target.businessInstanceId
    this.senderCore = new AiHostMessageSender(options)
    this.sender = (request) => this.send(request)
  }

  public async start(): Promise<void> {
    if (this.state.selected !== null && isSameScope(this.state.selected.scope, this.scope)) return
    const registration = this.resolveRegistration()
    await startRegistrationSession(registration, toAiHostRuntimeScope(this.scope))
    this.state.setSelected(registration, this.scope)
  }

  public getSessionRecord(): AiHostSessionRecord | null {
    const registration = this.state.selected?.registration ?? this.options.registry.get(this.scope.businessRegistrationId)
    return registration?.sessionStore?.getSession(toAiHostRuntimeScope(this.scope)) ?? null
  }

  public async send(request: AiHostChatRequest): Promise<void> {
    await this.senderCore.send({
      request,
      turn: request.turn ?? normalizeTurn(request),
      scope: this.scope,
    }, this.state)
  }

  private resolveRegistration(): AiHostBusinessRegistration {
    const registration = this.options.registry.get(this.scope.businessRegistrationId)
    if (registration === undefined) {
      throw new Error(`AI business registration is not registered: ${this.scope.businessRegistrationId}`)
    }
    return registration
  }
}

export function createAiHostBusinessSession(
  options: AiHostOptions,
  targetInput: AiHostBusinessTarget,
): AiHostBusinessSession {
  return new AiHostBusinessSession(options, targetInput)
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
