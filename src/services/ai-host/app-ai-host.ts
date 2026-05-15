import { shallowRef } from 'vue'
import type {
  AiChatSendRequest,
  AiSessionConfig,
} from '@spark-view/spark-component'
import {
  AppAiBusinessSelector,
} from './business-selector'
import {
  AppAiToolLoopRunner,
} from './tool-loop'
import {
  latestUserInput,
  normalizeTurn,
} from './turn-utils'
import {
  toRuntimeScope,
} from './scope'
import type {
  AppAiBusinessScope,
  AppAiHostOptions,
  AppAiHostSender,
} from './types'
import type {
  AppAiSelectedBusiness,
} from './selected-business'

export class AppAiHost {
  private readonly selectedScope = shallowRef<AppAiBusinessScope | null>(null)

  private selected: AppAiSelectedBusiness | null = null

  private readonly businessSelector: AppAiBusinessSelector

  private readonly toolLoopRunner: AppAiToolLoopRunner

  constructor(private readonly options: AppAiHostOptions) {
    this.businessSelector = new AppAiBusinessSelector(options)
    this.toolLoopRunner = new AppAiToolLoopRunner(options)
  }

  getSelectedScope(): AppAiBusinessScope | null {
    return this.selectedScope.value
  }

  private clearSelected(): void {
    this.selected = null
    this.selectedScope.value = null
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

  private async selectBusiness(request: AiChatSendRequest, turn: ReturnType<typeof normalizeTurn>): Promise<AppAiSelectedBusiness | null> {
    const selected = await this.businessSelector.selectBusiness(
      request,
      turn,
      this.selected,
      () => this.clearSelected(),
    )
    this.selected = selected
    this.selectedScope.value = selected?.scope ?? null
    return selected
  }

  private async send(request: AiChatSendRequest): Promise<void> {
    const turn = normalizeTurn(request)
    const selected = await this.selectBusiness(request, turn)
    if (selected === null) return

    const latestUser = latestUserInput(request)
    if (latestUser !== '') {
      selected.runtime.appendMessage({
        ...toRuntimeScope(selected.scope),
        role: 'user',
        content: latestUser,
        source: 'ui',
      })
    }

    await this.toolLoopRunner.runToolLoop(
      selected.runtime,
      selected.scope,
      selected.projection,
      request,
      turn,
      () => this.clearSelected(),
    )
  }
}
