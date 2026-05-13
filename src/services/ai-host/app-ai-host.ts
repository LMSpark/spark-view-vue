import { shallowRef } from 'vue'
import type {
  AiRuntimeKnowledgeProjection,
} from '@spark-view/spark-ai'
import type {
  AiChatSendRequest,
  AiSessionConfig,
} from '@spark-view/spark-component'
import {
  createAppAiStreamKey,
} from './scope'
import {
  createAppAiToolCodec,
} from './tool-codec'
import type {
  AppAiBusinessRuntime,
  AppAiBusinessScope,
  AppAiHostOptions,
  AppAiHostSender,
  AppAiTransportMessage,
  AppAiTransportToolCall,
  AppAiTurnMeta,
} from './types'

const ROUTE_CONFIDENCE_THRESHOLD = 0.65

function latestUserInput(request: AiChatSendRequest): string {
  for (let index = request.historyMsgs.length - 1; index >= 0; index -= 1) {
    const item = request.historyMsgs[index]
    if (item?.role === 'user') return item.content.trim()
  }
  return ''
}

function createInstanceId(moduleId: string, moduleInstanceId: string): string {
  return `ai:${moduleId}:${moduleInstanceId}`
}

function normalizeTurn(request: AiChatSendRequest): AppAiTurnMeta {
  const now = new Date().toISOString()
  return {
    turnId: request.turn?.turnId ?? globalThis.crypto.randomUUID(),
    seq: request.turn?.seq ?? 1,
    baseRevision: request.turn?.baseRevision ?? Math.max(0, request.historyMsgs.length - 1),
    queuedAt: request.turn?.queuedAt ?? now,
    startedAt: request.turn?.startedAt ?? now,
    maxParallelTurns: request.turn?.maxParallelTurns ?? 1,
  }
}

function toTransportMessages(messages: AiChatSendRequest['historyMsgs']): AppAiTransportMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

function parseToolArgs(raw: string | undefined): unknown {
  if (raw === undefined || raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function stringifyToolResult(result: unknown): string {
  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

function eventModuleIdFromAction(action: string): string {
  const parts = action.split('@')
  return parts.length >= 3 ? (parts[parts.length - 2] ?? 'tool') : 'tool'
}

export class AppAiHost {
  private readonly selectedScope = shallowRef<AppAiBusinessScope | null>(null)

  private selected:
    | {
        readonly runtime: AppAiBusinessRuntime
        readonly scope: AppAiBusinessScope
        projection: AiRuntimeKnowledgeProjection
      }
    | null = null

  constructor(private readonly options: AppAiHostOptions) {}

  getSelectedScope(): AppAiBusinessScope | null {
    return this.selectedScope.value
  }

  createSender(): AppAiHostSender {
    return (request) => this.send(request)
  }

  createPanelConfig(): AiSessionConfig {
    return {
      storageKey: () => {
        const scope = this.selectedScope.value
        return scope === null
          ? 'spark-ai-session:app-host-pending'
          : `spark-ai-session:${scope.businessRegistrationId}:${scope.businessInstanceId}`
      },
      disablePersistence: () => this.selectedScope.value === null,
      pageId: 'app-ai-host',
      sender: this.createSender(),
      title: 'AI 宿主',
      placeholder: '描述你要办理的事项',
      turnConcurrency: {
        maxParallelTurns: 2,
        overflow: 'queue',
      },
    }
  }

  private async selectBusiness(request: AiChatSendRequest): Promise<typeof this.selected> {
    if (this.selected !== null) return this.selected

    const userInput = latestUserInput(request)
    const decision = await this.options.transport.routeBusiness({
      userInput,
      candidates: this.options.registry.routingCandidates(),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    if (decision.moduleId === null || decision.confidence < ROUTE_CONFIDENCE_THRESHOLD) {
      request.onDelta?.('我还不能确定要办理哪个业务。请补充说明，比如“我要提交请假申请”。')
      return null
    }

    const runtime = this.options.registry.get(decision.moduleId)
    if (runtime === undefined) {
      request.onDelta?.(`没有找到注册业务：${decision.moduleId}`)
      return null
    }

    let businessInstanceId: string
    let projection: AiRuntimeKnowledgeProjection
    try {
      businessInstanceId = runtime.resolveBusinessInstance({
        userInput,
        context: this.options.context?.() ?? {},
      })
      const scopePreview: AppAiBusinessScope = {
        businessRegistrationId: runtime.moduleId,
        businessInstanceId,
        instanceId: createInstanceId(runtime.moduleId, businessInstanceId),
        runtimeInstanceId: createInstanceId(runtime.moduleId, businessInstanceId),
      }
      projection = await runtime.startSession({
        moduleId: runtime.moduleId,
        moduleInstanceId: businessInstanceId,
        instanceId: scopePreview.instanceId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      request.onDelta?.(`无法进入 ${runtime.getRegistrationData().name}：${message}`)
      return null
    }
    const scope: AppAiBusinessScope = {
      businessRegistrationId: runtime.moduleId,
      businessInstanceId,
      instanceId: createInstanceId(runtime.moduleId, businessInstanceId),
      runtimeInstanceId: createInstanceId(runtime.moduleId, businessInstanceId),
    }
    this.selected = { runtime, scope, projection }
    this.selectedScope.value = scope
    request.onDelta?.(`已进入 ${projection.module.name}。`)
    return this.selected
  }

  private async send(request: AiChatSendRequest): Promise<void> {
    const selected = await this.selectBusiness(request)
    if (selected === null) return

    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      selected.runtime.appendMessage({
        moduleId: selected.runtime.moduleId,
        moduleInstanceId: selected.scope.businessInstanceId,
        instanceId: selected.scope.instanceId,
        role: 'user',
        content: latestUser,
        source: 'ui',
      })
    }

    await this.runToolLoop(selected.runtime, selected.scope, selected.projection, request)
  }

  private async runToolLoop(
    runtime: AppAiBusinessRuntime,
    scope: AppAiBusinessScope,
    projection: AiRuntimeKnowledgeProjection,
    request: AiChatSendRequest,
  ): Promise<void> {
    const turn = normalizeTurn(request)
    const codec = createAppAiToolCodec(projection)
    const runtimeContext = {
      moduleId: runtime.moduleId,
      moduleInstanceId: scope.businessInstanceId,
      instanceId: scope.instanceId,
    }
    const systemPrompt = [
      runtime.getSystemPrompt?.(runtimeContext),
      request.systemPrompt,
      projection.promptSnapshot,
    ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n\n')
    const messages = toTransportMessages(request.historyMsgs)
    const sessionId = await this.options.transport.createSession({
      systemPrompt,
      messages,
      tools: codec.tools,
      scope,
      turn,
    })
    const maxRounds = this.options.maxToolRounds ?? 4

    for (let round = 0; round < maxRounds; round += 1) {
      const result = await this.options.transport.streamTurn({
        sessionId,
        scope,
        turn,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        onDelta: request.onDelta,
        onReasoning: request.onReasoning,
        onUsage: request.onUsage,
        onSseEvent: request.onSseEvent,
      })

      if (result.text.trim().length > 0) {
        runtime.appendMessage({
          moduleId: runtime.moduleId,
          moduleInstanceId: scope.businessInstanceId,
          instanceId: scope.instanceId,
          role: 'assistant',
          content: result.text,
          source: 'llm',
        })
      }

      if (result.toolCalls.length === 0) return

      const assistantMessage: AppAiTransportMessage = {
        role: 'assistant',
        content: result.text,
        tool_calls: result.toolCalls,
      }
      const toolMessages: AppAiTransportMessage[] = []
      for (const call of result.toolCalls) {
        const toolMessage = await this.executeToolCall(runtime, scope, projection, turn, codec.actionOf.bind(codec), call, request)
        if (toolMessage !== null) toolMessages.push(toolMessage)
      }
      await this.options.transport.appendMessages({
        sessionId,
        scope,
        messages: [assistantMessage, ...toolMessages],
      })
    }

    request.onDelta?.('工具调用轮次已达上限，请检查当前业务状态后继续。')
  }

  private async executeToolCall(
    runtime: AppAiBusinessRuntime,
    scope: AppAiBusinessScope,
    projection: AiRuntimeKnowledgeProjection,
    turn: AppAiTurnMeta,
    actionOf: (toolName: string) => string | null,
    call: AppAiTransportToolCall,
    request: AiChatSendRequest,
  ): Promise<AppAiTransportMessage | null> {
    const toolName = call.function?.name ?? ''
    const action = actionOf(toolName)
    if (action === null) {
      request.onDelta?.(`未识别的工具调用：${toolName}`)
      return null
    }
    const args = parseToolArgs(call.function?.arguments)
    const started = Date.now()
    const result = await runtime.executeFunctionCall({
      moduleId: runtime.moduleId,
      moduleInstanceId: scope.businessInstanceId,
      instanceId: scope.instanceId,
      action,
      args,
      projection,
    })
    const durationMs = Date.now() - started
    const eventModuleId = eventModuleIdFromAction(action)
    request.onFcCall?.({
      toolName: action,
      args,
      round: turn.seq,
      ...(call.id === undefined ? {} : { callId: call.id }),
      status: result.ok ? 'success' : 'error',
      result,
      durationMs,
    })
    request.onSseEvent?.({
      type: 'tool-result',
      data: stringifyToolResult(result),
      streamKey: createAppAiStreamKey(scope, eventModuleId, turn.turnId),
      scope: {
        businessRegistrationId: scope.businessRegistrationId,
        businessInstanceId: scope.businessInstanceId,
        eventModuleId,
        turnId: turn.turnId,
      },
    })

    return {
      role: 'tool',
      content: stringifyToolResult(result),
      ...(call.id === undefined ? {} : { tool_call_id: call.id }),
    }
  }
}
