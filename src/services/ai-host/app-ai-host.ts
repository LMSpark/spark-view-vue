import { shallowRef } from 'vue'
import type {
  AiChatSendRequest,
  AiFcCallInput,
  AiSessionConfig,
  AiSseEventInput,
} from '@spark-view/spark-component'
import type {
  AiHostChatRequest,
  AiHostFcCallRecord,
  AiHostOptions,
  AiHostBusinessScope,
  AiHostBusinessRuntimeContext,
  AiHostSelectedBusiness,
  AiHostSendContext,
  AiHostSendInput,
} from '@spark-view/spark-ai/host'
import {
  AiHostMessageSender,
} from '@spark-view/spark-ai/host'
import {
  normalizeTurn,
} from './turn-utils'

type AppAiHostOptions = AiHostOptions
type AppAiHostSender = (request: AiChatSendRequest) => Promise<void>

/**
 * App AI Host — Vue 集成层。
 *
 * 核心发送逻辑委托给 spark-ai/host 的 AiHostMessageSender，
 * 此类仅管理 Vue shallowRef 状态和 AiSessionConfig。
 */
export class AppAiHost {
  private readonly selectedScope = shallowRef<AiHostBusinessScope | null>(null)
  private selected: AiHostSelectedBusiness | null = null
  private readonly sender: AiHostMessageSender

  constructor(options: AppAiHostOptions) {
    this.sender = new AiHostMessageSender(options)
  }

  getSelectedScope(): AiHostBusinessScope | null {
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

  private async send(request: AiChatSendRequest): Promise<void> {
    const turn = normalizeTurn(request)
    const clearSelected = () => {
      this.selected = null
      this.selectedScope.value = null
    }
    const sendCtx: AiHostSendContext = {
      get selected() { return this.selected },
      clearSelected,
      setSelected: (s: AiHostSelectedBusiness) => {
        this.selected = s
        this.selectedScope.value = s.scope
      },
      appendUserMessage: (scope: AiHostBusinessRuntimeContext, content: string) => {
        const runtime = this.selected?.runtime
        if (runtime === undefined) return
        runtime.appendMessage({
          ...scope,
          role: 'user',
          content,
          source: 'ui',
        })
      },
    }
    const sendInput: AiHostSendInput = {
      request: this.toHostRequest(request),
      turn,
    }
    await this.sender.send(sendInput, sendCtx)
  }

  private toHostRequest(request: AiChatSendRequest): AiHostChatRequest {
    const hostRequest: AiHostChatRequest = {
      historyMsgs: request.historyMsgs,
    }
    if (request.systemPrompt !== undefined) hostRequest.systemPrompt = request.systemPrompt
    if (request.signal !== undefined) hostRequest.signal = request.signal
    if (request.onDelta !== undefined) hostRequest.onDelta = request.onDelta
    if (request.onReasoning !== undefined) hostRequest.onReasoning = request.onReasoning
    if (request.onUsage !== undefined) hostRequest.onUsage = request.onUsage
    hostRequest.onSseEvent = (event) => request.onSseEvent?.(this.adaptSseEvent(event))
    if (request.onFcCall !== undefined) {
      const onFcCall = request.onFcCall
      hostRequest.onFcCall = (record: AiHostFcCallRecord) => {
        const input: AiFcCallInput = {
          toolName: record.toolName,
          args: record.args,
          turnId: record.turnId,
          round: record.round,
          status: record.status,
          result: record.result as unknown,
          durationMs: record.durationMs,
        }
        if (record.callId !== undefined) input.callId = record.callId
        onFcCall(input)
      }
    }
    return hostRequest
  }

  private adaptSseEvent(event: { type: string; data: unknown }): AiSseEventInput {
    const adapted: AiSseEventInput = {
      type: event.type,
      data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
    }
    return adapted
  }
}
