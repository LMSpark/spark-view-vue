/**
 * useDevPageModelSession — DevSystem「页面模型级编辑」会话配置生成器。
 *
 * 职责边界：
 *  - 管理 sharedSessionHost + usePageModelEditSession。
 *  - 产出标准 {@link AiSessionConfig}，由业务组件传给 `useAiSession` 或直接调用
 *    `aiPanelStore.open(config)` 接入全局 AI 面板。
 *  - activePageId 变化时自动重置会话。
 */
import { computed, watch, type ComputedRef, type Ref } from 'vue'
import type { AiSessionConfig, AiChatSender, AiChatSendRequest } from '@spark-view/spark-component'
import { usePageModelSessionHost } from './usePageModelSessionHost'
import { usePageModelEditSession } from './usePageModelEditSession'
import type { DevState, PageFileName } from '../useDevState'

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

interface Options {
  state: DevState
  /** 当前工作区聚焦的文件名；供 prompt 延续摘要引用。 */
  activeFile: Ref<PageFileName | null> | ComputedRef<PageFileName | null>
}

// ═══════════════════════════════════════════════════════════
// 纯工具函数（与会话状态无关）
// ═══════════════════════════════════════════════════════════

/**
 * 将未知类型内容收敛为安全字符串。
 *
 * 目的：
 * - 避免直接把 unknown/any 传入模板字符串或返回值，触发 no-unsafe-return / no-unsafe-assignment。
 * - 保证 Prompt 组装链路始终得到 string。
 */
function toSafeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 获取最近 N 条非 system 消息（不包含当前最后一条用户输入）。
 *
 * 规则：
 * - 先去掉最后一条（当前轮用户输入），避免重复拼接。
 * - 过滤 system，保留用户与助手的可读上下文。
 */
function pickRecentConversation(
  historyMsgs: AiChatSendRequest['historyMsgs'],
  maxCount: number,
): AiChatSendRequest['historyMsgs'] {
  return historyMsgs
    .slice(0, -1)
    .filter((message) => message.role !== 'system')
    .slice(-maxCount)
}

export function useDevPageModelSession(options: Options) {
  // ═════════════════════════════════════════════════════════
  // 会话基础对象
  // ═════════════════════════════════════════════════════════

  const { state } = options

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
    onStatus: (message, statusType) => {
      state.addStatus(
        message,
        statusType === 'success' ? 'success' : statusType === 'warning' ? 'warning' : 'error',
      )
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
   * - 这里仅输出“当前实时模型事实”，不输出历史推断。
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
   * - 若后端有可恢复会话，或无历史消息：只拼接“事实快照 + 本轮用户需求”。
   * - 否则追加近几轮 transcript，但明确声明“历史结论不可覆盖当前事实”。
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

  /**
   * 从对话历史中反向查找最近一条用户输入。
   *
   * 返回约束：
   * - 始终返回 string。
   * - 非字符串内容会被安全收敛为空串，避免不安全返回。
   */
  function findLatestUserPrompt(historyMsgs: AiChatSendRequest['historyMsgs']): string {
    for (let index = historyMsgs.length - 1; index >= 0; index -= 1) {
      const message = historyMsgs[index]
      if (message?.role === 'user') {
        return toSafeText(message.content).trim()
      }
    }
    return ''
  }

  // ═════════════════════════════════════════════════════════
  // 会话执行层
  // ═════════════════════════════════════════════════════════

  /**
   * 确保页面模型与编辑会话已就绪。
   *
   * 流程：
   * 1) 先拉齐 4 文件到内存模型。
   * 2) 再静默 bootstrap（skipContextLoad 避免重复加载）。
   */
  async function ensurePageModelReady(): Promise<void> {
    await state.ensureActivePageFilesLoaded()
    await editSession.bootstrap({ silent: true, skipContextLoad: true })
  }

  /**
   * 执行一次模型级会话调用。
   *
   * 处理细节：
   * - 若流式 delta 已输出，则不再重复回放最后日志。
   * - 若无 delta，则回退到最新日志作为兜底输出（非静默）。
   * - 若最新日志是 error，直接抛错给上层 sender。
   */
  async function runEditSessionChat(request: AiChatSendRequest, prompt: string): Promise<void> {
    let streamed = false
    await editSession.runLlm(prompt, {
      ...(request.signal ? { signal: request.signal } : {}),
      skipBootstrap: true,
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

  // ═════════════════════════════════════════════════════════
  // 对外导出层（AiSessionConfig）
  // ═════════════════════════════════════════════════════════

  /**
   * 标准 AI 发送函数：
   * - 提取本轮用户输入
   * - 保证模型就绪
   * - 组装延续 prompt 后执行 runLlm
   */
  const sender: AiChatSender = async (request) => {
    const prompt = findLatestUserPrompt(request.historyMsgs)
    if (!prompt) return
    await ensurePageModelReady()
    request.onDelta?.('已接收需求，正在执行页面模型级编辑...\n')
    await runEditSessionChat(request, buildContinuationPrompt(prompt, request.historyMsgs))
  }

  /**
   * 暴露给 AI 面板的统一配置。
   *
   * 关键点：
   * - storageKey 按 pageId 隔离，避免跨页面串历史。
   * - beforeOpen 先做就绪检查，确保面板打开即可执行。
   */
  const config: AiSessionConfig = {
    storageKey: () => `devsystem-ai-chat:${state.activePageId.value}`,
    title: '页面模型级编辑',
    placeholder: '支持多轮对话；会通过 stills tool 层执行 4 文件模型级编辑',
    sender,
    externalToolLogs: editSession.log,
    beforeOpen: async () => {
      await ensurePageModelReady()
    },
  }

  return { config, disabled }
}
