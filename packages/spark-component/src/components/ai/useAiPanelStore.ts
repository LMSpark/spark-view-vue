/**
 * AI 会话标准化配置与全局面板状态中心。
 *
 * ── 分层约定 ──
 *   AppAiPanel（唯一 UI 宿主） ── 消费 ──► useAiPanelStore（状态中心）
 *                                          ▲
 *                                          │ open(config)
 *                                          │
 *   AiLauncherButton（通用入口）◄── 生产 ── 业务 composable / 业务组件
 *
 * ── 标准化的"配置"概念 ──
 *   所有 AI 入口（包括 App 头部、业务按钮、快捷键等）统一通过 {@link AiSessionConfig}
 *   这一份标准契约描述一次会话；store 负责按此契约驱动 {@link AppAiPanel} 渲染。
 *
 *   业务层职责：**只负责产出** `AiSessionConfig`。
 *   基础设施职责：消费 config，完成持久化、响应式透传、生命周期管理。
 */
import { computed, ref, shallowRef, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue'
import { Logger } from '@spark-view/spark-utils'
import type { AiChatSender, AiFcErrorReporter, AiTurnConcurrencyConfig } from './useAiChat'

const logger = Logger('AiPanel')

/** 工具调用日志（透传给 AiChatWidget 的 externalToolLogs）。 */
export interface AiSessionToolLog {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
  timestamp?: string
}

// ── 工具 (Function Call) ────────────────────────────────────────────────────

/**
 * 工具 function 声明（对齐 OpenAI / DeepSeek function-call schema）。
 * 业务脚本可直接以字面量形式写出：
 * ```js
 * { name: 'queryOrders', description: '...', parameters: { type: 'object', ... } }
 * ```
 */
export interface AiToolSpec {
  readonly name: string
  readonly description?: string
  readonly parameters?: Record<string, unknown>
}

export interface AiToolInvocationContext {
  readonly signal?: AbortSignal
  readonly pushLog?: (log: AiSessionToolLog) => void
}

export type AiToolHandler = (
  args: unknown,
  ctx: AiToolInvocationContext,
) => unknown

/** SSE + Function-Call 循环配置（由 sender 实现读取）。 */
export interface AiFcLoopConfig {
  /** 是否启用本地 FC 循环（业务 sender 自行实现时读取本字段）。 */
  readonly enabled?: boolean
  /** 单次 sender 调用内允许的最大工具往返轮数。 */
  readonly maxRounds?: number
  /** 自定义后端端点（默认走 /api/ai/chat/stream）。 */
  readonly endpoint?: string
}

/** 反馈配置：文本反馈 + 点赞 / 点踩回调。 */
export interface AiFeedbackConfig {
  /** 绑定到 UI 文本框的 ref。 */
  readonly value?: Ref<string>
  /** 提交反馈文本；target 标识对应消息和点赞/点踩来源。 */
  readonly onSubmit?: (
    text: string,
    target?: { messageId?: string; rating?: 'up' | 'down' },
  ) => void | Promise<void>
}

/** 草稿按钮配置：提供诊断文本、前缀提示词的异步 builder。 */
export interface AiDraftActionConfig {
  readonly id: string
  readonly label: string
  readonly icon?: string
  /** 异步 builder：返回草稿文本，前缀来自此字段。 */
  readonly prefix?: string
  /** 异步 builder 函数，返回诊断内容文本。 */
  readonly builder: () => Promise<string>
}

// ── 事件机制 ────────────────────────────────────────────────────────────────

/**
 * 会话全生命周期事件映射表。
 *
 * 基础设施在对应时机自动 emit；业务通过 {@link AiSessionConfig.hooks} 声明式订阅，
 * 或通过 {@link useAiPanelStore}.on/off 命令式订阅。
 *
 * 注意：handler 是"通知式"的，**不能中断流程**。如需拦截，请用 sender / beforeOpen。
 */
export interface AiSessionEventMap {
  // 生命周期
  /** 面板 open() 被调用，尚未执行 beforeOpen、面板尚未可见。 */
  'open': { config: AiSessionConfig }
  /** 面板已可见（beforeOpen 已结束，无论成功失败）。 */
  'opened': { config: AiSessionConfig }
  /** 当前 config 被显式重同步；用于已打开面板切换业务上下文。 */
  'sync': { previousConfig: AiSessionConfig | null; config: AiSessionConfig }
  /** config 重同步完成（beforeOpen 已结束）。 */
  'synced': { previousConfig: AiSessionConfig | null; config: AiSessionConfig }
  /** 面板即将关闭（visible 仍为 true）。 */
  'close': { config: AiSessionConfig | null }
  /** 面板已关闭。 */
  'closed': { config: AiSessionConfig | null }
  /** 业务 dispose：config 被释放。 */
  'dispose': { config: AiSessionConfig }

  // 缓存出入（由 AiChatWidget 在 localStorage 读写时触发）
  'snapshot:restore': { storageKey: string; size: number }
  'snapshot:persist': { storageKey: string; size: number }
  'snapshot:clear': { storageKey: string }

  // 消息流（sender 内部负责 emit）
  'message:send': { messageId: string; content: string }
  'message:delta': { messageId: string; delta: string }
  'message:complete': { messageId: string; content: string; usage?: Record<string, unknown> }
  'message:error': { messageId?: string; error: unknown }

  // 函数调用 / FC 循环
  'tool:call': { toolName: string; args: unknown; round: number; callId?: string }
  'tool:result': { toolName: string; args: unknown; result: unknown; round: number; callId?: string; durationMs: number }
  'tool:error': { toolName: string; args: unknown; error: unknown; round: number; callId?: string }
  'fc:round:start': { round: number }
  'fc:round:end': { round: number; calls: number }

  // 反馈
  'feedback:submit': { text: string; messageId?: string; rating?: 'up' | 'down' }
}

export type AiSessionEventName = keyof AiSessionEventMap
export type AiSessionEventHandler<K extends AiSessionEventName> = (
  payload: AiSessionEventMap[K],
) => void

/**
 * 声明式 hooks：把事件名直接作为 config 字段，一字段一事件。
 * 仅用 `Partial` 即可实现完全可选。
 */
export type AiSessionHooks = {
  readonly [K in AiSessionEventName]?: AiSessionEventHandler<K>
}

/**
 * AI 会话标准配置。
 *
 * 所有文本字段支持 `MaybeRefOrGetter<string>`，以便业务随上下文动态变更
 * （例如按 activePageId 切换 storageKey 而不重新注册 config）。
 *
 * externalToolLogs 必须是 Ref/ComputedRef，面板通过它驱动工具日志视图。
 */
export interface AiSessionConfig {
  /** 持久化 key。AiChatWidget 按此从 localStorage 恢复历史；用作重挂载 :key。 */
  readonly storageKey: MaybeRefOrGetter<string>
  /** 禁用会话快照读写。用于业务尚未被语义路由选定的 pending 阶段。 */
  readonly disablePersistence?: MaybeRefOrGetter<boolean | undefined>
  /** 业务页 ID。用于把诊断流按页面归属聚合；未提供时退回 storageKey。 */
  readonly pageId?: MaybeRefOrGetter<string | undefined>
  /** 聊天发送器——业务会话的入口，把自己的会话逻辑实现在这里。 */
  readonly sender: AiChatSender
  /** 面板标题。 */
  readonly title?: MaybeRefOrGetter<string>
  /** 输入框 placeholder。 */
  readonly placeholder?: MaybeRefOrGetter<string>
  /** 外部工具日志。面板展示此流，业务端在 sender 执行过程中 push 条目。 */
  readonly externalToolLogs?: Ref<AiSessionToolLog[]> | ComputedRef<AiSessionToolLog[]>
  /** 清空外部工具日志。若未提供，面板只清空自身内部日志。 */
  readonly clearExternalToolLogs?: () => void
  /** FC 调用失败时的诊断回传器。 */
  readonly fcErrorReporter?: AiFcErrorReporter
  /** turn 并发配置；默认由 AiChatWidget 保持 1 个在途 turn。 */
  readonly turnConcurrency?: MaybeRefOrGetter<AiTurnConcurrencyConfig | undefined>
  /** 打开面板前的准备钩子（例如预加载上下文文件）。失败不会阻止面板打开。 */
  readonly beforeOpen?: () => void | Promise<void>

  // ── 全配置：提示词 / 工具 / FC / 反馈 ──
  /** 自定义 system prompt。sender 可读取并随请求下发。 */
  readonly systemPrompt?: MaybeRefOrGetter<string>
  /** 工具使用指南文本；sender 通常拼接到 system prompt 尾部。 */
  readonly toolGuide?: MaybeRefOrGetter<string>
  /** 工具目录（function schema 列表）。 */
  readonly toolCatalog?: MaybeRefOrGetter<readonly AiToolSpec[]>
  /** 工具实例（函数名 → 执行器）；sender 在 FC 循环中按名查找并调用。 */
  readonly toolInstances?: Record<string, AiToolHandler>
  /** SSE + Function-Call 循环配置。 */
  readonly fcLoop?: AiFcLoopConfig
  /** 反馈机制（文本 + 点赞点踩）。 */
  readonly feedback?: AiFeedbackConfig
  /** 人工触发的诊断草稿按钮。 */
  readonly draftActions?: MaybeRefOrGetter<readonly AiDraftActionConfig[]>
  /** action 精确标题映射（可选，业务侧注入）。 */
  readonly actionTitleMap?: MaybeRefOrGetter<Record<string, string> | undefined>
  /** action 前缀标题映射（可选，业务侧注入）。 */
  readonly actionPrefixTitleMap?: MaybeRefOrGetter<Record<string, string> | undefined>
  /** action 后缀标题映射（可选，业务侧注入）。 */
  readonly actionSuffixTitleMap?: MaybeRefOrGetter<Record<string, string> | undefined>
  /** 声明式生命周期 hooks（事件名即字段名）。 */
  readonly hooks?: AiSessionHooks
}

const DEFAULT_STORAGE_KEY = 'ai-panel-global'
const DEFAULT_TITLE = 'AI 助手'
const DEFAULT_PLACEHOLDER = '有什么可以帮您？'

const visible = ref(false)
const configRef = shallowRef<AiSessionConfig | null>(null)

const storageKey = computed(() => toValue(configRef.value?.storageKey ?? DEFAULT_STORAGE_KEY))
const disablePersistence = computed(() => toValue(configRef.value?.disablePersistence ?? false) === true)
const pageId = computed(() => {
  const rawPageId = configRef.value?.pageId !== undefined ? toValue(configRef.value.pageId) : undefined
  return typeof rawPageId === 'string' && rawPageId.trim() !== '' ? rawPageId : storageKey.value
})
const title = computed(() => toValue(configRef.value?.title ?? DEFAULT_TITLE))
const placeholder = computed(() => toValue(configRef.value?.placeholder ?? DEFAULT_PLACEHOLDER))
const externalToolLogs = computed<AiSessionToolLog[] | undefined>(() => {
  const logs = configRef.value?.externalToolLogs
  return logs ? logs.value : undefined
})
const clearExternalToolLogs = computed<(() => void) | undefined>(() => configRef.value?.clearExternalToolLogs)
const fcErrorReporter = computed<AiFcErrorReporter | undefined>(() => configRef.value?.fcErrorReporter)
const sender = computed(() => configRef.value?.sender)
const hasConfig = computed(() => configRef.value !== null)

// ── 全配置对外 getter ──
const systemPrompt = computed<string | undefined>(() => {
  const v = configRef.value?.systemPrompt
  return v !== undefined ? toValue(v) : undefined
})
const toolGuide = computed<string | undefined>(() => {
  const v = configRef.value?.toolGuide
  return v !== undefined ? toValue(v) : undefined
})
const toolCatalog = computed<readonly AiToolSpec[] | undefined>(() => {
  const v = configRef.value?.toolCatalog
  return v !== undefined ? toValue(v) : undefined
})
const toolInstances = computed<Record<string, AiToolHandler> | undefined>(() => {
  return configRef.value?.toolInstances
})
const fcLoop = computed<AiFcLoopConfig | undefined>(() => configRef.value?.fcLoop)
const feedback = computed<AiFeedbackConfig | undefined>(() => configRef.value?.feedback)
const turnConcurrency = computed<AiTurnConcurrencyConfig | undefined>(() => {
  const v = configRef.value?.turnConcurrency
  return v !== undefined ? toValue(v) : undefined
})
const draftActions = computed<readonly AiDraftActionConfig[] | undefined>(() => {
  const v = configRef.value?.draftActions
  return v !== undefined ? toValue(v) : undefined
})
const actionTitleMap = computed<Record<string, string> | undefined>(() => {
  const v = configRef.value?.actionTitleMap
  return v !== undefined ? toValue(v) : undefined
})
const actionPrefixTitleMap = computed<Record<string, string> | undefined>(() => {
  const v = configRef.value?.actionPrefixTitleMap
  return v !== undefined ? toValue(v) : undefined
})
const actionSuffixTitleMap = computed<Record<string, string> | undefined>(() => {
  const v = configRef.value?.actionSuffixTitleMap
  return v !== undefined ? toValue(v) : undefined
})

// ── 事件总线 ────────────────────────────────────────────────────────────────

type AnyHandler = (payload: unknown) => void
const listeners = new Map<AiSessionEventName, Set<AnyHandler>>()

function on<K extends AiSessionEventName>(
  event: K,
  handler: AiSessionEventHandler<K>,
): () => void {
  let set = listeners.get(event)
  if (!set) {
    set = new Set()
    listeners.set(event, set)
  }
  set.add(handler as AnyHandler)
  return () => off(event, handler)
}

function off<K extends AiSessionEventName>(
  event: K,
  handler: AiSessionEventHandler<K>,
): void {
  listeners.get(event)?.delete(handler as AnyHandler)
}

function emit<K extends AiSessionEventName>(event: K, payload: AiSessionEventMap[K]): void {
  // 声明式 hook（来自 config.hooks）——每次 emit 实时读，允许 config 热替换。
  const hook = configRef.value?.hooks?.[event]
  if (hook) {
    try {
      hook(payload)
    } catch (err) {
      // 通知式 handler 不应中断主流程；写入 logger 以便诊断。
      logger.error(`hook "${event}" threw`, err)
    }
  }
  // 命令式订阅
  const set = listeners.get(event)
  if (!set) return
  for (const h of set) {
    try {
      h(payload)
    } catch (err) {
      logger.error(`listener for "${event}" threw`, err)
    }
  }
}

async function runBeforeOpen(config: AiSessionConfig): Promise<void> {
  try {
    await config.beforeOpen?.()
  } catch {
    // 打开/同步钩子失败不阻止面板显示；错误由 sender/状态通道上报。
  }
}

async function open(config: AiSessionConfig): Promise<void> {
  configRef.value = config
  emit('open', { config })
  await runBeforeOpen(config)
  visible.value = true
  emit('opened', { config })
}

async function sync(config: AiSessionConfig): Promise<void> {
  const previousConfig = configRef.value
  configRef.value = config
  emit('sync', { previousConfig, config })
  await runBeforeOpen(config)
  emit('synced', { previousConfig, config })
}

function close(): void {
  const cfg = configRef.value
  if (visible.value) emit('close', { config: cfg })
  visible.value = false
  emit('closed', { config: cfg })
}

function toggle(): void {
  if (visible.value) {
    close()
  } else {
    visible.value = true
    const cfg = configRef.value
    if (cfg) emit('opened', { config: cfg })
  }
}

/**
 * 业务组件卸载时调用：若当前持有的正是本 config，则清除引用，避免闭包悬挂。
 */
function disposeIf(config: AiSessionConfig): void {
  if (configRef.value === config) {
    if (visible.value) emit('close', { config })
    visible.value = false
    configRef.value = null
    emit('closed', { config: null })
    emit('dispose', { config })
  }
}

function getCurrentConfig(): AiSessionConfig | null {
  return configRef.value
}

export function useAiPanelStore() {
  return {
    visible,
    storageKey,
    disablePersistence,
    pageId,
    title,
    placeholder,
    externalToolLogs,
    clearExternalToolLogs,
    fcErrorReporter,
    sender,
    hasConfig,
    // 全配置对外 getter
    systemPrompt,
    toolGuide,
    toolCatalog,
    toolInstances,
    fcLoop,
    feedback,
    turnConcurrency,
    draftActions,
    actionTitleMap,
    actionPrefixTitleMap,
    actionSuffixTitleMap,
    // 操作
    open,
    sync,
    close,
    toggle,
    disposeIf,
    getCurrentConfig,
    // 事件总线
    on,
    off,
    emit,
  }
}
