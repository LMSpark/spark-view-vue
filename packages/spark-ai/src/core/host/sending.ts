/**
 * 框架无关的 AI Host 消息发送逻辑。
 *
 * 核心流程：选择/复用业务 → 追加用户消息 → 运行工具调用循环。
 * 不依赖 Vue/React/Angular。
 */

import { AiHostToolLoopRunner } from './tool-loop'
import { toAiHostRuntimeScope } from './scope'
import { latestUserInput } from './turn-utils'
import { AiHostBusinessSelector } from './business-selector'
import type {
  AiHostBusinessRuntimeContext,
  AiHostChatRequest,
  AiHostOptions,
  AiHostSelectedBusiness,
  AiHostTurnMeta,
} from './types'

export interface AiHostSendInput {
  readonly request: AiHostChatRequest
  readonly turn: AiHostTurnMeta
}

export interface AiHostSendContext {
  selected: AiHostSelectedBusiness | null
  clearSelected(): void
  setSelected(selected: AiHostSelectedBusiness): void
  appendUserMessage(scope: AiHostBusinessRuntimeContext, content: string): void
}

export class AiHostMessageSender {
  private readonly businessSelector: AiHostBusinessSelector
  private readonly toolLoopRunner: AiHostToolLoopRunner

  constructor(options: AiHostOptions) {
    this.businessSelector = new AiHostBusinessSelector(options)
    this.toolLoopRunner = new AiHostToolLoopRunner(options)
  }

  async send(
    input: AiHostSendInput,
    ctx: AiHostSendContext,
  ): Promise<void> {
    const { request, turn } = input
    const selected = await this.businessSelector.selectBusiness(
      request,
      turn,
      ctx.selected,
      ctx.clearSelected,
    )
    if (selected === null) return

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
}
