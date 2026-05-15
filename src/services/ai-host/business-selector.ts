import type { AiChatSendRequest } from '@spark-view/spark-component'
import {
  createAppAiBusinessScope,
  toRuntimeScope,
} from './scope'
import { latestUserInput } from './turn-utils'
import type { AppAiHostOptions, AppAiTurnMeta } from './types'
import type { AppAiSelectedBusiness } from './selected-business'

const ROUTE_CONFIDENCE_THRESHOLD = 0.65

export class AppAiBusinessSelector {
  constructor(private readonly options: AppAiHostOptions) {}

  async selectBusiness(
    request: AiChatSendRequest,
    turn: AppAiTurnMeta,
    current: AppAiSelectedBusiness | null,
    clearCurrent: () => void,
  ): Promise<AppAiSelectedBusiness | null> {
    const userInput = latestUserInput(request)
    const resolveInput = {
      userInput,
      context: this.options.context?.() ?? {},
    }
    if (current !== null) {
      const canReuseSelection = current.runtime.canReuseSelection
      if (canReuseSelection === undefined || canReuseSelection(resolveInput, current.scope)) {
        return current
      }
      clearCurrent()
    }

    const decision = await this.options.transport.routeBusiness({
      userInput,
      candidates: this.options.registry.routingCandidates(),
      turn,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    if (decision.moduleId === null || decision.confidence < ROUTE_CONFIDENCE_THRESHOLD) {
      request.onDelta?.('我还不能确定要办理哪个业务。请补充说明要处理的业务和目标。')
      return null
    }

    const runtime = this.options.registry.get(decision.moduleId)
    if (runtime === undefined) {
      request.onDelta?.(`没有找到注册业务：${decision.moduleId}`)
      return null
    }

    try {
      const businessInstanceId = runtime.resolveBusinessInstance(resolveInput)
      const scope = createAppAiBusinessScope(runtime.moduleId, businessInstanceId)
      const projection = await runtime.startSession(toRuntimeScope(scope))
      request.onDelta?.(`已进入 ${projection.module.name}。`)
      return { runtime, scope, projection }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      request.onDelta?.(`无法进入 ${runtime.getRegistrationData().name}：${message}`)
      return null
    }
  }
}
