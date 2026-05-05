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
  type AiSessionPolicies,
  type AiFcCallRecord,
  type CollaborationPolicy,
  type RecoveryPolicy,
} from '@spark-view/spark-component'
import type { DialogueTurn } from '@spark-view/spark-ai'
import { reportAiFcError } from '@/services/ai-fc-error-monitor'
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

  function getStorageKey(): string {
    return `devsystem-ai-chat:${state.activePageId.value}`
  }

  function reportFcError(record: AiFcCallRecord) {
    return reportAiFcError(record, {
      source: 'dev-page-model-session',
      ...(state.activePageId.value ? { pageId: state.activePageId.value } : {}),
      ...(options.activeFile.value !== null ? { activeFile: options.activeFile.value } : {}),
      storageKey: getStorageKey(),
      sessionKey: state.activePageId.value || 'unknown',
    })
  }

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
  function buildPolicyPrompt(policies: AiSessionPolicies | undefined): string {
    const recovery = policies?.recovery ?? 'layered'
    const collaboration = policies?.collaboration ?? 'critical-confirm'
    const recoveryText: Record<RecoveryPolicy, string> = {
      layered: '分层恢复：允许模型根据工具反馈换路径继续，但连续只读只作为节奏提醒，不硬中止。',
      manual: '手动恢复：遇到不确定、失败或目录漫游时，优先说明当前状态并等待用户补充，不要自行长时间重试。',
      strict: '严格恢复：减少试错，重复失败或同参重复时更快停止并暴露原因。',
    }
    const collaborationText: Record<CollaborationPolicy, string> = {
      auto: '自动执行：允许直接执行必要写入。',
      'critical-confirm': '关键确认：新增/更新可直接执行；删除、批量替换、清空或覆盖式写入前先说明风险并等待用户确认。',
      'plan-confirm': '计划确认：本轮只做读取、分析和方案说明，不执行写入。',
      'step-confirm': '逐步执行：本轮只推进一个小步骤，完成后停下汇报，等待下一条指令。',
      'human-takeover': '人工接管：AI 不执行页面模型写入，只保留上下文供人工操作后继续。',
    }
    return [
      '[人机协同策略]',
      `恢复策略=${recovery}；${recoveryText[recovery]}`,
      `协作策略=${collaboration}；${collaborationText[collaboration]}`,
    ].join('\n')
  }

  function buildRecoveryRepeatDetection(policy: RecoveryPolicy | undefined) {
    switch (policy ?? 'layered') {
      case 'manual':
        return {
          maxSameSignature: 12,
          maxConsecutiveErrors: 12,
          maxCyclePeriod: 4,
          cycleRepeatThreshold: 3,
          maxReadOnlyActions: 0,
          maxRepeatedFailureRetries: 4,
        }
      case 'strict':
        return {
          maxSameSignature: 3,
          maxConsecutiveErrors: 3,
          maxCyclePeriod: 3,
          cycleRepeatThreshold: 2,
          maxReadOnlyActions: 8,
          abortOnReadOnlyLimit: true,
          maxRepeatedFailureRetries: 1,
        }
      case 'layered':
      default:
        return {
          maxSameSignature: 6,
          maxConsecutiveErrors: 6,
          maxCyclePeriod: 4,
          cycleRepeatThreshold: 2,
          maxReadOnlyActions: 12,
          abortOnReadOnlyLimit: true,
          maxRepeatedFailureRetries: 2,
        }
    }
  }

  function buildContinuationPrompt(
    prompt: string,
    historyMsgs: AiChatSendRequest['historyMsgs'],
    policies: AiSessionPolicies | undefined,
  ): string {
    const hasBackendSession = sessionHost.getResumeSessionOptions().resumeSessionId !== undefined
    const previousMessages = pickRecentConversation(historyMsgs, 8)
    const modelFacts = buildModelFactsSnapshot()
    const policyPrompt = buildPolicyPrompt(policies)
    if (hasBackendSession || previousMessages.length === 0) {
      return `${modelFacts}\n\n${policyPrompt}\n\n${prompt}`
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
      policyPrompt,
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

  function emitTurnAsToolEvent(turn: DialogueTurn, request: AiChatSendRequest): void {
    const action = turn.toolBlock?.action
    const result = turn.stillsResult
    if (!action || !result) return
    const callId = turn.toolBlock?.id
    const timestamp = turn.timestamp
    const base = {
      toolName: action,
      args: turn.toolBlock?.params,
      round: turn.round,
      ...(callId !== undefined ? { callId } : {}),
    }
    panelStore.emit('tool:call', base)
    if (result.ok) {
      request.onFcCall?.({
        toolName: action,
        args: turn.toolBlock?.params,
        round: turn.round,
        ...(callId !== undefined ? { callId } : {}),
        status: 'success',
        result: result.data ?? result.summary ?? null,
        durationMs: turn.elapsed ?? 0,
        timestamp,
      })
      panelStore.emit('tool:result', {
        ...base,
        result: result.data ?? result.summary ?? null,
        durationMs: turn.elapsed ?? 0,
      })
    } else {
      request.onFcCall?.({
        toolName: action,
        args: turn.toolBlock?.params,
        round: turn.round,
        ...(callId !== undefined ? { callId } : {}),
        status: 'error',
        error: result.msg ?? `${action} 失败`,
        result,
        timestamp,
      })
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
    storageKey: getStorageKey,
    pageId: () => state.activePageId.value,
    title: '页面模型级编辑',
    placeholder: '支持多轮对话；会通过 stills tool 层执行 4 文件模型级编辑',
    draftActions: [
      {
        id: 'preview-page-text',
        label: '发送页面文本',
        icon: 'TXT',
        prefix: '请基于以下页面可见文本与 HTML 片段进行分析，必要时修改 style.css。',
        builder: async () => await state.buildPreviewPageTextDraft(),
      },
      {
        id: 'preview-js-error',
        label: '发送 JS 错误',
        icon: 'ERR',
        prefix: '请基于以下 JS 错误快照分析并给出 script.js 修复方案。',
        builder: async () => await state.buildPreviewJsErrorDraft(),
      },
    ],
    externalToolLogs: editSession.log,
    clearExternalToolLogs: () => editSession.clearLog(),
    fcErrorReporter: reportFcError,
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
      const policies = request.policies
      const messageId = `devsystem-${Date.now()}`
      panelStore.emit('message:send', { messageId, content: prompt })

      await state.ensureActivePageFilesLoaded()
      await editSession.bootstrap({ silent: true, skipContextLoad: true })
      if (policies?.collaboration === 'human-takeover') {
        const takeoverText = '已切换为人工接管：AI 不执行页面模型写入。你可以手动调整 4 个文件后继续发下一条指令。'
        panelStore.emit('message:delta', { messageId, delta: takeoverText })
        request.onDelta?.(takeoverText)
        panelStore.emit('message:complete', { messageId, content: takeoverText })
        return
      }
      request.onDelta?.('已接收需求，正在执行页面模型级编辑...\n')

      let aggregated = ''
      try {
        await streamWithFallback(request, {
          runLoop: async (pushDelta) => {
            await editSession.runLlm(buildContinuationPrompt(prompt, request.historyMsgs, policies), {
              originalUserInput: prompt,
              ...(request.signal ? { signal: request.signal } : {}),
              skipBootstrap: true,
              repeatDetection: buildRecoveryRepeatDetection(policies?.recovery),
              ...(policies?.collaboration === 'plan-confirm' ? { toolMode: 'describe-only' as const } : {}),
              ...(policies?.collaboration === 'step-confirm' ? { maxRounds: 1 } : {}),
              ...(request.onSseEvent !== undefined ? { onSseEvent: request.onSseEvent } : {}),
              onDelta: (delta) => {
                aggregated += delta
                panelStore.emit('message:delta', { messageId, delta })
                pushDelta(delta)
              },
              onReasoning: (reasoning) => {
                request.onReasoning?.(reasoning)
              },
              onToolTurn: (turn) => emitTurnAsToolEvent(turn, request),
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
