/**
 * AI Sender 通用助手——从业务 AiChatSender 实现中反复出现的模式抽取而来。
 *
 * 定位：**纯函数 / 模式模板**，不持有状态、不依赖 Vue 响应式。
 * 业务层（例如 DevSystem 的 useDevPageModelSession）组装 sender 时可直接复用。
 *
 * 不在这里处理的东西（属业务层）：
 *  - prompt 业务拼接（模型事实快照、页面上下文等强业务语义）
 *  - 后端会话恢复 / stills tool host 绑定
 *  - 跨页面状态重置
 */
import type { AiChatSendRequest } from './useAiChat'

type HistoryMsgs = AiChatSendRequest['historyMsgs']

/**
 * 将未知类型内容安全收敛为字符串——避免把 unknown / any 透给模板拼接。
 */
export function toSafeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 从历史消息中反向查找最近一条用户输入。未找到返回空串（已 trim）。
 */
export function findLatestUserPrompt(historyMsgs: HistoryMsgs): string {
  for (let index = historyMsgs.length - 1; index >= 0; index -= 1) {
    const message = historyMsgs[index]
    if (message?.role === 'user') {
      return toSafeText(message.content).trim()
    }
  }
  return ''
}

/**
 * 取最近 N 条非 system 消息（不包含最后一条当前轮用户输入，避免与本轮 prompt 重复）。
 */
export function pickRecentConversation(historyMsgs: HistoryMsgs, maxCount: number): HistoryMsgs {
  return historyMsgs
    .slice(0, -1)
    .filter((message) => message.role !== 'system')
    .slice(-maxCount)
}

/**
 * "流式 + 兜底" sender 执行模板。
 *
 * 场景：业务 sender 内部跑一次 LLM（通常带 tool-loop），LLM 一般通过 `onDelta` 回推
 * 流式内容；但若某些路径没有 delta 输出（例如全部是工具调用，或后端异常），需要
 * 回落到业务层最新产生的"日志条目"兜底，避免 UI 上 sender 看起来静默成功。
 *
 * 约束：
 *  - `runLoop(pushDelta)` 必须在有可见输出时调用 `pushDelta`；helper 仅据此判断是否发生过流式。
 *  - `getFallbackMessage` 在未流式时被调用一次，返回 `{ text, isError }`；返回 `null`
 *    视为"也没有兜底"，helper 会推出固定占位串，避免 UI 完全静默。
 *  - 若 `request.signal.aborted`，不追加任何回落（用户主动中断）。
 *
 * @example
 * ```ts
 * await streamWithFallback(request, {
 *   runLoop: async (push) => {
 *     await editSession.runLlm(prompt, { onDelta: push })
 *   },
 *   getFallbackMessage: () => {
 *     const last = editSession.log.value.at(-1)
 *     if (!last) return null
 *     return { text: `${last.tag}: ${last.text}`, isError: last.type === 'error' }
 *   },
 *   defaultDeltaOnEmpty: '已执行完成。',
 * })
 * ```
 */
export interface StreamWithFallbackOptions {
  /**
   * 实际执行 LLM 调用的循环。通过 `pushDelta` 推送流式片段。
   * pushDelta 被调用过 → helper 判定为"已流式"，跳过兜底。
   */
  runLoop: (pushDelta: (text: string) => void) => Promise<void>
  /**
   * 未产生流式片段时的兜底消息源（例如读取最后一条业务日志）。
   * 返回 null 表示没有业务兜底；helper 会改用 `defaultDeltaOnEmpty`。
   */
  getFallbackMessage?: () => { text: string; isError?: boolean } | null
  /** 真正彻底没有任何输出时的占位文本。 */
  defaultDeltaOnEmpty?: string
}

export async function streamWithFallback(
  request: AiChatSendRequest,
  options: StreamWithFallbackOptions,
): Promise<void> {
  let streamed = false
  const pushDelta = (text: string): void => {
    streamed = true
    request.onDelta?.(text)
  }
  await options.runLoop(pushDelta)
  if (request.signal?.aborted === true) return
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- streamed 由 pushDelta 在 runLoop 内部异步置 true，ESLint 追踪不到
  if (streamed) return
  const fallback = options.getFallbackMessage?.()
  if (fallback) {
    if (fallback.isError) throw new Error(fallback.text)
    request.onDelta?.(fallback.text)
    return
  }
  if (options.defaultDeltaOnEmpty) request.onDelta?.(options.defaultDeltaOnEmpty)
}
