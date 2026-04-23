/**
 * useDevPageModelSession — DevSystem「页面模型级编辑」会话配置生成器。
 *
 * 职责边界：
 *  - 管理 sharedSessionHost + useUnifiedEditSession。
 *  - 产出标准 {@link AiSessionConfig}，由业务组件传给 `useAiSession` 或直接调用
 *    `aiPanelStore.open(config)` 接入全局 AI 面板。
 *  - activePageId 变化时自动重置会话。
 */
import { computed, watch, type ComputedRef, type Ref } from 'vue'
import type { AiSessionConfig } from '@/composables/useAiPanelStore'
import type { AiChatSender, AiChatSendRequest } from '@/composables/useAiChat'
import { usePageModelSessionHost } from './usePageModelSessionHost'
import { useUnifiedEditSession } from './useUnifiedEditSession'
import type { DevState, PageFileName } from '../useDevState'

interface Options {
  state: DevState
  /** 当前工作区聚焦的文件名；供 prompt 延续摘要引用。 */
  activeFile: Ref<PageFileName | null> | ComputedRef<PageFileName | null>
}

export function useDevPageModelSession(options: Options) {
  const { state } = options

  const sessionHost = usePageModelSessionHost({
    getLiveModelAdapter: () => state.getLiveModelAdapter(),
    getSessionKey: () => state.activePageId.value,
  })

  const editSession = useUnifiedEditSession({
    getSessionKey: () => state.activePageId.value,
    getLiveModelAdapter: () => state.getLiveModelAdapter(),
    sessionHost,
    ensureContextLoaded: async () => {
      await state.ensureActivePageFilesLoaded()
    },
    onStatus: (message, statusType) => {
      state.addStatus(
        message,
        statusType === 'success' ? 'success' : statusType === 'warning' ? 'warning' : 'error',
      )
    },
  })

  watch(() => state.activePageId.value, (pageId, previousPageId) => {
    if (pageId !== previousPageId) {
      sessionHost.resetSync()
      editSession.reset()
    }
  })

  const disabled = computed(() => !state.activePageId.value)

  function buildContinuationPrompt(prompt: string, historyMsgs: AiChatSendRequest['historyMsgs']): string {
    const hasBackendSession = sessionHost.getResumeSessionOptions().resumeSessionId !== undefined
    const previousMessages = historyMsgs.slice(0, -1).filter(message => message.role !== 'system')
    if (hasBackendSession || previousMessages.length === 0) {
      return prompt
    }
    const transcript = previousMessages
      .slice(-8)
      .map(message => `${message.role === 'assistant' ? 'AI' : '用户'}: ${message.content}`)
      .join('\n')
    return [
      '[全局对话延续]',
      `当前页面: ${state.activePageId.value}`,
      `当前焦点文件: ${options.activeFile.value ?? 'unknown'}`,
      '以下是最近对话摘录；当前真实读写只以当前页面 live model 为准，AI 不维护独立模型副本。',
      transcript,
      '',
      '[本轮用户需求]',
      prompt,
    ].join('\n')
  }

  async function runEditSessionChat(request: AiChatSendRequest, prompt: string): Promise<void> {
    let streamed = false
    await editSession.runLlm(prompt, {
      ...(request.signal ? { signal: request.signal } : {}),
      onDelta: (delta) => {
        streamed = true
        request.onDelta?.(delta)
      },
      onReasoning: (reasoning) => {
        request.onReasoning?.(reasoning)
      },
    })
    if (request.signal?.aborted === true) return
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- streamed 在 onDelta 闭包中被异步置 true，eslint 不追踪此路径
    if (streamed) return
    const latest = editSession.log.value.at(-1)
    if (latest === undefined) {
      request.onDelta?.('模型级编辑已执行完成。')
      return
    }
    if (latest.type === 'error') {
      throw new Error(`${latest.tag}: ${latest.text}`)
    }
    request.onDelta?.(`${latest.tag}: ${latest.text}`)
  }

  const sender: AiChatSender = async (request) => {
    const prompt = [...request.historyMsgs].reverse().find(message => message.role === 'user')?.content.trim() ?? ''
    if (!prompt) return
    request.onDelta?.('已接收需求，正在执行页面模型级编辑...\n')
    await runEditSessionChat(request, buildContinuationPrompt(prompt, request.historyMsgs))
  }

  const config: AiSessionConfig = {
    storageKey: () => `devsystem-ai-chat:${state.activePageId.value}`,
    title: '页面模型级编辑',
    placeholder: '支持多轮对话；会通过 stills tool 层执行 4 文件模型级编辑',
    sender,
    externalToolLogs: editSession.log,
    beforeOpen: async () => {
      await state.ensureActivePageFilesLoaded()
    },
  }

  return { config, disabled }
}
