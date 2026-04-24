/**
 * useDevPageModelSession — DevSystem「页面模型级编辑」会话配置生成器。
 *
 * 职责边界：
 *  - 管理 sharedSessionHost + usePageModelEditSession。
 *  - 产出标准 {@link AiSessionConfig}，由业务组件以 `:config` 传入
 *    {@link AiLauncherButton}，或直接调用 `aiPanelStore.open(config)` 接入全局 AI 面板。
 *  - 会话过程中的 tool 调用 / FC 轮次 / 消息生命周期，均经 `useAiPanelStore().emit`
 *    往总线上出；AiLauncherButton 作为中继把它们映射为 Vue emits，供消费层
 *    完全声明式参与。
 *  - activePageId 变化时自动重置会话。
 */
import { computed, watch, type ComputedRef, type Ref } from 'vue'
import {
  findLatestUserPrompt,
  pickRecentConversation,
  streamWithFallback,
  toSafeText,
  useAiPanelStore,
  type AiSessionConfig,
  type AiChatSendRequest,
} from '@spark-view/spark-component'
import type { DialogueTurn } from '@spark-view/spark-ai'
import { usePageModelSessionHost } from './usePageModelSessionHost'
import { usePageModelEditSession } from './usePageModelEditSession'
import type { DevState, PageFileName } from './useDevState'

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

interface Options {
  state: DevState
  /** 当前工作区聚焦的文件名；供 prompt 延续摘要引用。 */
  activeFile: Ref<PageFileName | null> | ComputedRef<PageFileName | null>
}

// ═══════════════════════════════════════════════════════════
// 业务入口
// ═══════════════════════════════════════════════════════════
// 通用 sender 助手（toSafeText / findLatestUserPrompt / pickRecentConversation /
// streamWithFallback）已下沉到 @spark-view/spark-component；本文件仅保留业务特有
// 的 prompt 拼接逻辑。

export function useDevPageModelSession(options: Options) {
  // ═════════════════════════════════════════════════════════
  // 会话基础对象
  // ═════════════════════════════════════════════════════════

  const { state } = options
  const panelStore = useAiPanelStore()

  // pageId 级宿主：负责 stills 会话、后端 session、跨页重置。
  const sessionHost = usePageModelSessionHost({
    getEditToolHost: () => state.getEditToolHost(),
    getSessionKey: () => state.activePageId.value,
  })

  // 统一编辑会话：内部封装 bootstrap / runLlm / 工具日志。
  const editSession = usePageModelEditSession({
    getSessionKey: () => state.activePageId.value,
    getEditToolHost: () => state.getEditToolHost(),
    sessionHost,
    ensureContextLoaded: async () => {
      await state.ensureActivePageFilesLoaded()
    },
  })

  // 页面切换时，强制重置会话宿主和编辑状态，防止跨页面上下文污染。
  watch(() => state.activePageId.value, (pageId, previousPageId) => {
    if (pageId !== previousPageId) {
      sessionHost.resetSync()
      editSession.reset()
    }
  })

  // 无 activePageId 时禁止 AI 面板发送请求。
  const disabled = computed(() => !state.activePageId.value)

  // ═════════════════════════════════════════════════════════
  // Prompt 构建层
  // ═════════════════════════════════════════════════════════

  /**
   * 生成模型事实快照，作为每轮 Prompt 的强约束前缀。
   *
   * 注意：
   * - 这里仅输出"当前实时模型事实"，不输出历史推断。
   * - 该快照用于抑制 AI 在多轮中复用陈旧结论。
   */
  function buildModelFactsSnapshot(): string {
    const ruleTree = state.documents['rule.json'].model.value
    const ruleRoot = ruleTree?.toJSON()
    const ruleChildrenCount = Array.isArray(ruleRoot?.children) ? ruleRoot.children.length : null

    const dataSetTool = state.documents['pagedata.json'].model.value
    const tables = dataSetTool?.toJson().tables ?? {}
    const tableCount = Object.keys(tables).length

    const scriptLength = state.documents['script.js'].text.value.length
    const styleLength = state.documents['style.css'].text.value.length

    return [
      '[页面模型事实快照]',
      `pageId=${state.activePageId.value || 'unknown'}`,
      `ruleChildrenCount=${ruleChildrenCount ?? 'unknown'}`,
      `datasetTableCount=${tableCount}`,
      `scriptLength=${scriptLength}`,
      `styleLength=${styleLength}`,
      '事实约束：除非 ruleChildrenCount=0 且后续工具核验 countNodes=1，否则禁止宣称 rule.json 为空。',
    ].join('\n')
  }

  /**
   * 组装本轮延续 Prompt。
   *
   * 分支策略：
   * - 若后端有可恢复会话，或无历史消息：只拼接"事实快照 + 本轮用户需求"。
   * - 否则追加近几轮 transcript，但明确声明"历史结论不可覆盖当前事实"。
   */
  function buildContinuationPrompt(prompt: string, historyMsgs: AiChatSendRequest['historyMsgs']): string {
    const hasBackendSession = sessionHost.getResumeSessionOptions().resumeSessionId !== undefined
    const previousMessages = pickRecentConversation(historyMsgs, 8)
    const modelFacts = buildModelFactsSnapshot()
    if (hasBackendSession || previousMessages.length === 0) {
      return `${modelFacts}\n\n${prompt}`
    }
    const transcript = previousMessages
      .map((message) => {
        const content = toSafeText(message.content)
        return `${message.role === 'assistant' ? 'AI' : '用户'}: ${content}`
      })
      .join('\n')
    return [
      modelFacts,
      '',
      '[全局对话延续]',
      `当前页面: ${state.activePageId.value}`,
      `当前焦点文件: ${options.activeFile.value ?? 'unknown'}`,
      '以下仅保留最近用户需求；AI 旧结论不得覆盖当前页面模型事实。',
      transcript,
      '',
      '[本轮用户需求]',
      prompt,
    ].join('\n')
  }


  // ═════════════════════════════════════════════════════════
  // 事件转发：stills 的 DialogueTurn → AiPanelStore 总线
  // AiLauncherButton 作为中继再把它们转为 Vue emits 交给 DevSystem。
  // ═════════════════════════════════════════════════════════

  function emitTurnAsToolEvent(turn: DialogueTurn): void {
    const action = turn.toolBlock?.action
    const result = turn.stillsResult
    if (!action || !result) return
    const callId = turn.toolBlock?.id
    const base = {
      toolName: action,
      args: turn.toolBlock?.params,
      round: turn.round,
      ...(callId !== undefined ? { callId } : {}),
    }
    panelStore.emit('tool:call', base)
    if (result.ok) {
      panelStore.emit('tool:result', {
        ...base,
        result: result.data ?? result.summary ?? null,
        durationMs: turn.elapsed ?? 0,
      })
    } else {
      panelStore.emit('tool:error', {
        ...base,
        error: new Error(result.msg ?? `${action} 失败`),
      })
    }
  }

  // ═════════════════════════════════════════════════════════
  // 对外导出层（AiSessionConfig）
  // ═════════════════════════════════════════════════════════

  const config: AiSessionConfig = {
    storageKey: () => `devsystem-ai-chat:${state.activePageId.value}`,
    title: '页面模型级编辑',
    placeholder: '支持多轮对话；会通过 stills tool 层执行 4 文件模型级编辑',
    externalToolLogs: editSession.log,
    beforeOpen: async () => {
      await state.ensureActivePageFilesLoaded()
      await editSession.bootstrap({ silent: true, skipContextLoad: true })
    },
    /**
     * 标准 AI 发送函数（直接内联到 config）：
     *  1) 提取本轮用户输入；
     *  2) 确保页面模型就绪；
     *  3) 走 streamWithFallback 执行 runLlm，并把 turn / run / 消息级事件 emit 到
     *     AiPanelStore 总线，AiLauncherButton 消费其中继。
     */
    sender: async (request: AiChatSendRequest) => {
      const prompt = findLatestUserPrompt(request.historyMsgs)
      if (!prompt) return
      const messageId = `devsystem-${Date.now()}`
      panelStore.emit('message:send', { messageId, content: prompt })

      await state.ensureActivePageFilesLoaded()
      await editSession.bootstrap({ silent: true, skipContextLoad: true })
      request.onDelta?.('已接收需求，正在执行页面模型级编辑...\n')

      let aggregated = ''
      try {
        await streamWithFallback(request, {
          runLoop: async (pushDelta) => {
            await editSession.runLlm(buildContinuationPrompt(prompt, request.historyMsgs), {
              ...(request.signal ? { signal: request.signal } : {}),
              skipBootstrap: true,
              onDelta: (delta) => {
                aggregated += delta
                panelStore.emit('message:delta', { messageId, delta })
                pushDelta(delta)
              },
              onReasoning: (reasoning) => {
                request.onReasoning?.(reasoning)
              },
              onToolTurn: emitTurnAsToolEvent,
              onRunComplete: ({ rounds, writeCount }) => {
                panelStore.emit('fc:round:end', { round: rounds, calls: writeCount })
              },
            })
          },
          getFallbackMessage: () => {
            const latest = editSession.log.value.at(-1)
            if (!latest) return null
            return { text: `${latest.tag}: ${latest.text}`, isError: latest.type === 'error' }
          },
          defaultDeltaOnEmpty: '模型级编辑已执行完成。',
        })
        panelStore.emit('message:complete', { messageId, content: aggregated })
      } catch (error) {
        panelStore.emit('message:error', { messageId, error })
        throw error
      }
    },
  }

  return { config, disabled }
}
