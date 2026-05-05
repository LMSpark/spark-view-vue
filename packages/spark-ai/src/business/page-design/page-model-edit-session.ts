/**
 * 页面模型编辑会话控制器
 *
 * 时序主线：
 * 1. 会话初始化：通过 bootstrap 读取 live page model 并执行 pageDesign@lifecycle@bootstrap。
 * 2. 编排运行：通过 runLlm 启动函数编排循环，接收 SSE 增量并记录日志。
 * 3. 写入回投：识别工具写操作后同步页面模型投影，触发 NodeTree/DataSet 变更通知。
 * 4. 生命周期收束：通过 reset/dispose 中止活动运行并清理会话状态。
 *
 * 功能边界：
 * - 该模块只负责“页面编辑会话控制流”；不负责页面文件加载实现细节。
 * - 页面文件的真实读写能力由 EditToolHost 提供并由调用方注入。
 */

import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DialogueTurn, OrchestratorResult, SessionBackend, ToolDefinition } from '../../core/protocol/session-contracts'
import { runFunctionLoop } from '../../core/runtime/session-orchestrator'
import { generateToolDefinitions, functionNameToAction } from '../../core/protocol/fc-schema'
import { PAGE_DESIGN_EDIT_RUNTIME_PROMPT } from './prompts/edit-runtime-prompt'
import type { FunctionResult, FunctionRuntimeContext } from '../../core/protocol/function-contracts'
import { executeFunction } from '../../core/runtime/function-dispatcher'
import { createDefaultFollowUpPolicy } from '../../core/runtime/default-follow-up-policy'
import {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from '../../core/runtime/repeat-detection-monitor'
import {
  editInit,
  EDIT_FUNCTION_SUMMARIES,
  getActiveNodeTree,
  isEditDataSetWriteAction,
  isEditNodeTreeWriteAction,
  isEditWriteAction,
  type EditState,
  type EditToolHost,
} from './functions'
import {
  createPageModelSessionHost,
  type PageModelSessionHostRuntime,
  type PageModelFunctionContext,
} from './page-model-session-host'

const CORE_KNOWLEDGE_GUIDE_PAYLOAD_ACTION = 'core@knowledge@guidePayload'
const CORE_KNOWLEDGE_QUERY_PAYLOADS_ACTION = 'core@knowledge@queryPayloads'

/**
 * 分区 A：运行态状态与日志类型
 */
export interface PageModelEditLogEntry {
  /** 日志级别：普通信息、成功态、错误态。 */
  type: 'info' | 'success' | 'error'
  /** 日志标签：用于标识阶段或动作，例如 pageDesign@lifecycle@bootstrap。 */
  tag: string
  /** 日志正文：可为模型文本、工具摘要或错误信息。 */
  text: string
  /** ISO 时间戳，便于跨端对齐与排序。 */
  timestamp: string
}

export interface PageModelEditSessionState {
  /** 是否完成最小可运行初始化。 */
  ready: boolean
  /** 当前会话是否发生了写入型变更。 */
  dirty: boolean
  /** 是否处于编排运行中。 */
  busy: boolean
  /** LLM 流式文本缓冲区，仅承载当前轮临时增量。 */
  aiBuffer: string
  /** 有界日志缓冲（内部按 LOG_LIMIT 维护）。 */
  log: PageModelEditLogEntry[]
  /** 当前激活的页面节点树投影，供 UI 即时消费。 */
  nodeTree: SparkNodeTree | null
}

/**
 * 分区 B：编排入口与运行时可替换能力
 */
export interface StartPageModelIterateSessionOptions {
  /** 会话后端：负责与服务端会话交互。 */
  backend: SessionBackend
  /** 函数运行时上下文。 */
  context: FunctionRuntimeContext
  /** 本轮用户输入（已可包含上层拼接上下文）。 */
  userPrompt: string
  /** 系统提示词，约束本轮工具执行规则。 */
  systemPrompt: string
  /** 最大轮次上限，防止无限循环。 */
  maxRounds?: number
  /** 对话滑动窗口大小。 */
  slidingWindow?: number
  /** 可选续跑会话 ID。 */
  resumeSessionId?: string
  /** 取消信号，用于中止当前运行。 */
  signal?: AbortSignal
  /** SSE 事件回调：用于增量文本与可观测事件透传。 */
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
  /** 每轮完成回调：用于消费工具执行细节。 */
  onTurnComplete?: (turn: DialogueTurn) => void
  /** 可选工具定义集合。 */
  tools?: ToolDefinition[]
  /** 重复检测策略。 */
  repeatDetection?: RepeatDetectionConfig
}

export interface PageModelEditSessionRuntime {
  /** 函数执行入口，可被测试替换。 */
  executeFunction: typeof executeFunction
  /** 编排启动函数，可被测试替换。 */
  startIterateSession: (options: StartPageModelIterateSessionOptions) => Promise<OrchestratorResult>
  /** FC 工具定义生成器。 */
  generateToolDefinitions: typeof generateToolDefinitions
  /** FC 名称到动作名映射器。 */
  functionNameToAction: typeof functionNameToAction
  /** 编辑运行时系统提示词。 */
  PAGE_DESIGN_EDIT_RUNTIME_PROMPT: string
  /** 从编辑状态读取当前 NodeTree。 */
  getActiveNodeTree: typeof getActiveNodeTree
  /** 动作判定：是否写操作。 */
  isEditWriteAction: (value: string) => boolean
  /** 动作判定：是否 NodeTree 写操作。 */
  isEditNodeTreeWriteAction: (value: string) => boolean
  /** 动作判定：是否 DataSet 写操作。 */
  isEditDataSetWriteAction: (value: string) => boolean
}

export interface PageModelEditSessionOptions {
  /** 当前上下文会话键，用于检测会话漂移并触发重建。 */
  getSessionKey: () => string
  /** 编辑工具宿主，提供 live model 读写桥。 */
  getEditToolHost: () => EditToolHost
  /** 可选外部宿主；不传则内部创建并负责释放。 */
  sessionHost?: PageModelSessionHostRuntime
  /** 上下文加载钩子（如确保页面文件已就绪）。 */
  ensureContextLoaded?: () => Promise<void>
  /** 可选运行时覆盖项，便于测试或扩展。 */
  runtime?: Partial<PageModelEditSessionRuntime>
}

export interface PageModelEditRunHooks {
  /** 文本增量回调。 */
  onDelta?: (delta: string) => void
  /** 推理增量回调。 */
  onReasoning?: (reasoning: string) => void
  /** 原始 SSE 事件透传。 */
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
  /** 工具轮次回调。 */
  onToolTurn?: (turn: DialogueTurn) => void
  /** 运行结束回调：返回轮次和写入次数。 */
  onRunComplete?: (payload: { rounds: number; writeCount: number }) => void
  /** 外部中止信号。 */
  signal?: AbortSignal
}

export interface PageModelEditRunOptions extends PageModelEditRunHooks {
  /** 原始人工输入；用于诊断日志，不包含系统拼接的上下文 prompt。 */
  originalUserInput?: string
  /** true 表示跳过 bootstrap，直接使用已存在会话。 */
  skipBootstrap?: boolean
  /** 覆盖默认最大轮次。 */
  maxRounds?: number
  /** 工具模式：all 为完整工具集，describe-only 仅描述类工具。 */
  toolMode?: 'all' | 'describe-only'
  /** 覆盖重复检测参数。 */
  repeatDetection?: RepeatDetectionConfig
}

export interface PageModelEditBootstrapOptions {
  /** 静默模式：失败仍抛错，但不写入用户日志。 */
  silent?: boolean
  /** true 表示不触发 ensureContextLoaded。 */
  skipContextLoad?: boolean
}

/**
 * 分区 C：对外控制器契约
 */
export interface PageModelEditSessionController {
  /** 读取当前只读状态快照。 */
  getState: () => Readonly<PageModelEditSessionState>
  /** 订阅状态变更，返回取消订阅函数。 */
  subscribe: (listener: (state: Readonly<PageModelEditSessionState>) => void) => () => void
  /** 引导初始化：加载上下文并执行 pageDesign@lifecycle@bootstrap。 */
  bootstrap: (options?: PageModelEditBootstrapOptions) => Promise<PageModelFunctionContext>
  /** 运行一轮 LLM 编辑会话。 */
  runLlm: (prompt: string, hooks?: PageModelEditRunOptions) => Promise<void>
  /** 清空日志缓冲。 */
  clearLog: () => void
  /** 重置当前会话与运行态。 */
  reset: () => void
  /** 释放资源（不一定重置 UI 状态）。 */
  dispose: () => void
}

/**
 * 分区 D：默认编排执行器
 *
 * 说明：
 * - 该函数只做参数组装与默认值兜底。
 * - 真正编排逻辑在 runFunctionLoop 内部。
 */
function startPageModelIterateSession(
  options: StartPageModelIterateSessionOptions,
): Promise<OrchestratorResult> {
  return runFunctionLoop(options.userPrompt, options.context, options.backend, {
    maxRounds: options.maxRounds ?? 20,
    slidingWindow: options.slidingWindow ?? 10,
    systemPrompt: options.systemPrompt,
    ...(options.resumeSessionId !== undefined ? { resumeSessionId: options.resumeSessionId } : {}),
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.onSseEvent !== undefined ? { onSseEvent: options.onSseEvent } : {}),
    ...(options.onTurnComplete !== undefined ? { onTurnComplete: options.onTurnComplete } : {}),
    monitors: [createRepeatDetectionMonitor(options.repeatDetection)],
    followUpPolicy: createDefaultFollowUpPolicy(),
  })
}

/**
 * 默认运行时依赖映射。
 *
 * 通过 options.runtime 覆盖时，可定向替换单项能力（例如测试注入）。
 */
const DEFAULT_RUNTIME: PageModelEditSessionRuntime = {
  executeFunction,
  startIterateSession: startPageModelIterateSession,
  generateToolDefinitions,
  functionNameToAction,
  PAGE_DESIGN_EDIT_RUNTIME_PROMPT,
  getActiveNodeTree,
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function findEditActionByFunctionName(functionName: string): string {
  return EDIT_FUNCTION_SUMMARIES.find((definition) => definition.action.endsWith(`@${functionName}`))?.action ?? functionName
}

function isPageDesignReadOnlyAction(action: string): boolean {
  if (action.startsWith('core@')) return true
  return EDIT_FUNCTION_SUMMARIES.find((definition) => definition.action === action)?.type === 'describe'
}

const getPageDesignRepeatedFailureKey: NonNullable<RepeatDetectionConfig['getRepeatedFailureKey']> = (ctx) => {
  if (ctx.currentTurn.toolBlock?.action !== CORE_KNOWLEDGE_GUIDE_PAYLOAD_ACTION) return null
  if (ctx.result.ok || ctx.result.code !== 'PAYLOAD_NOT_FOUND') return null
  if (!isRecord(ctx.params)) return null

  const payloadRef = readStringField(ctx.params, 'payloadRef')
  const key = readStringField(ctx.params, 'key')
  if (payloadRef === null || key === null) return null
  return `${payloadRef}/${key}`
}

const buildPageDesignRepeatedFailureFollowUp: NonNullable<RepeatDetectionConfig['buildRepeatedFailureFollowUp']> = (key, count) => (
  `[系统组件替换提醒]\n参数荷载 ${key} 已连续 ${count} 次查询失败。\n禁止继续重复调用 ${CORE_KNOWLEDGE_GUIDE_PAYLOAD_ACTION} 盲试该 key。\n请先调用 ${CORE_KNOWLEDGE_QUERY_PAYLOADS_ACTION} 重新选择可用组件，再继续后续写动作。`
)

const buildPageDesignCycleFollowUp: NonNullable<RepeatDetectionConfig['buildCycleFollowUp']> = (cycleActions) => {
  const cycleText = cycleActions.join(' → ')
  const findByTypeAction = findEditActionByFunctionName('findByType')
  const listChildrenAction = findEditActionByFunctionName('listChildren')
  const getNodeAction = findEditActionByFunctionName('getNode')
  return `[系统循环修复提醒]\n检测到动作进入周期循环：${cycleText}。\n不要重复原动作序列，请立即改用另一条路径继续：\n1. 先调用 ${CORE_KNOWLEDGE_QUERY_PAYLOADS_ACTION} 重新确认可用组件清单；\n2. 对不存在的组件 key 不再重复 ${CORE_KNOWLEDGE_GUIDE_PAYLOAD_ACTION} 盲试；\n3. 若是节点写动作失败，先用 ${findByTypeAction} 或 ${listChildrenAction}/${getNodeAction} 拿到真实 id，再执行写入。`
}

const buildPageDesignReadOnlyLimitFollowUp: NonNullable<RepeatDetectionConfig['buildReadOnlyLimitFollowUp']> = (count) => (
  `[系统执行节奏提醒]\n当前已连续 ${count} 次只读动作，尚未进入写入。\n请停止继续枚举组件目录，立即基于已确认的组件执行最小写动作；若组件不存在，先通过 ${CORE_KNOWLEDGE_QUERY_PAYLOADS_ACTION} 替换为可用组件后再写入。`
)

/**
 * 分区 E：轻量判定与格式化工具
 */
function isToolWriteAction(runtime: PageModelEditSessionRuntime, action: string): boolean {
  return runtime.isEditWriteAction(action)
}

function isNodeTreeWriteAction(runtime: PageModelEditSessionRuntime, action: string): boolean {
  return runtime.isEditNodeTreeWriteAction(action)
}

function isDataSetWriteAction(runtime: PageModelEditSessionRuntime, action: string): boolean {
  return runtime.isEditDataSetWriteAction(action)
}

/**
 * 过滤无意义 SSE 事件，避免污染日志和前端增量流。
 */
function isEmptySseMonitorEvent(event: { type: string; data: string }): boolean {
  const data = event.data.trim()
  return data === '' || (event.type === 'done' && data === '{}')
}

/**
 * 日志输入裁剪：避免超长人工输入造成日志膨胀。
 */
function formatHumanInputForLog(input: string): string {
  const trimmed = input.trim()
  const maxLength = 20000
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}\n...<truncated>`
}

/**
 * 分区 F：会话控制器工厂（主流程）
 */
export function createPageModelEditSession(
  options: PageModelEditSessionOptions,
): PageModelEditSessionController {
  /** 基础依赖：由调用方注入上下文键与工具宿主。 */
  const { getSessionKey, getEditToolHost, ensureContextLoaded } = options

  /** 运行时装配：默认实现 + 可选覆盖。 */
  const runtime: PageModelEditSessionRuntime = {
    ...DEFAULT_RUNTIME,
    ...options.runtime,
  }

  /** 宿主管理权：仅当内部创建时，reset/dispose 才负责同步释放。 */
  const ownsSessionHost = options.sessionHost === undefined
  const sessionHost = options.sessionHost ?? createPageModelSessionHost({
    getEditToolHost,
    getSessionKey,
  })

  /** 运行态状态：对外通过 getState/subscribe 暴露快照。 */
  let state: PageModelEditSessionState = {
    ready: false,
    dirty: false,
    busy: false,
    aiBuffer: '',
    log: [],
    nodeTree: null,
  }

  /** 监听器集合与运行控制变量。 */
  const listeners = new Set<(state: Readonly<PageModelEditSessionState>) => void>()
  const LOG_LIMIT = 200
  let activeRunId = 0
  let runAbortController: AbortController | null = null

  /**
   * 状态通知：深拷贝日志数组，避免订阅方误改内部状态。
   */
  function notify(): void {
    const snapshot: PageModelEditSessionState = {
      ...state,
      log: [...state.log],
    }
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  /** 原子替换状态并触发通知。 */
  function setState(nextState: PageModelEditSessionState): void {
    state = nextState
    notify()
  }

  /** 局部补丁更新。 */
  function patchState(patch: Partial<PageModelEditSessionState>): void {
    setState({
      ...state,
      ...patch,
    })
  }

  /**
   * 写入一条日志；支持 merge 模式将同标签连续日志拼接为一条。
   */
  function pushLog(type: PageModelEditLogEntry['type'], tag: string, text: string, logOptions?: { merge?: boolean }): void {
    const nextLog = [...state.log]
    if (logOptions?.merge) {
      const last = nextLog.at(-1)
      if (last?.type === type && last.tag === tag) {
        nextLog[nextLog.length - 1] = {
          ...last,
          text: last.text + text,
        }
        patchState({ log: nextLog })
        return
      }
    }
    nextLog.push({ type, tag, text, timestamp: new Date().toISOString() })
    if (nextLog.length > LOG_LIMIT) {
      nextLog.splice(0, nextLog.length - LOG_LIMIT)
    }
    patchState({ log: nextLog })
  }

  /**
   * 确保函数运行时与业务状态可用，并将当前活跃 NodeTree 投影写回本地状态。
   */
  function ensureRuntime(): { context: PageModelFunctionContext; editState: EditState } {
    const ensured = sessionHost.ensureSession()
    patchState({
      ready: true,
      dirty: false,
      nodeTree: runtime.getActiveNodeTree(ensured.editState),
    })
    if (ensured.bootstrapped) {
      pushLog('info', 'session-ready', '编辑函数运行时已挂接到当前页面模型；后续读写仅通过 FC 函数执行')
    }
    return { context: ensured.context, editState: ensured.editState }
  }

  /**
   * 将外部 AbortSignal 绑定到当前运行控制器，返回解绑函数。
   */
  function linkAbortSignal(signal: AbortSignal | undefined, controller: AbortController): () => void {
    if (!signal) return () => {}

    const abortCurrentRun = () => {
      controller.abort(signal.reason)
    }

    if (signal.aborted) {
      abortCurrentRun()
      return () => {}
    }

    signal.addEventListener('abort', abortCurrentRun, { once: true })
    return () => signal.removeEventListener('abort', abortCurrentRun)
  }

  /** 中止当前活动运行（如果存在）。 */
  function abortActiveRun(): void {
    runAbortController?.abort()
    runAbortController = null
  }

  /**
   * SSE 事件分发：
   * - delta: 追加到 aiBuffer 并透传。
   * - reasoning: 透传推理文本。
   * - result: 解析工具调用并写入日志，随后清空 aiBuffer。
   * - error: 清空 aiBuffer，错误日志由上层异常路径统一处理。
   */
  function onSseEvent(event: { sessionId: string; type: string; data: string }, hooks?: PageModelEditRunHooks): void {
    hooks?.onSseEvent?.(event)

    if (isEmptySseMonitorEvent(event)) return

    if (event.type === 'delta') {
      patchState({ aiBuffer: state.aiBuffer + event.data })
      hooks?.onDelta?.(event.data)
      return
    }

    if (event.type === 'reasoning') {
      hooks?.onReasoning?.(event.data)
      return
    }

    if (event.type === 'result') {
      try {
        const parsed = JSON.parse(event.data) as {
          toolCalls?: Array<{ function?: { name?: string } }>
        }
        const actions = (parsed.toolCalls ?? [])
          .map((toolCall) => toolCall.function?.name)
          .filter((name): name is string => Boolean(name))
          .map((name) => runtime.functionNameToAction(name))
        if (state.aiBuffer || actions.length > 0) {
          pushLog(
            'info',
            actions.length > 0 ? `LLM → ${actions.join(', ')}` : 'LLM 响应',
            state.aiBuffer || '(无文本)',
          )
        }
      } catch {
        if (state.aiBuffer) {
          pushLog('info', 'LLM 响应', state.aiBuffer)
        }
      }
      patchState({ aiBuffer: '' })
      return
    }

    if (event.type === 'error') {
      patchState({ aiBuffer: '' })
      return
    }
  }

  /**
  * 统一函数执行失败格式，保证错误输出可直接展示给用户。
   */
  function formatFunctionFailure(result: Extract<FunctionResult, { ok: false }>): string {
    return `${result.msg}\n修复建议: ${result.fix}`
  }

  /**
   * 将工具执行结果回投到页面模型：
   * - 仅在存在写操作时执行。
   * - NodeTree 与 DataSet 分开判定，按需触发对应变更通知。
   */
  function syncPageModelProjection(actions: readonly string[]): void {
    const toolHost = getEditToolHost()
    const hasWrites = actions.some((action) => isToolWriteAction(runtime, action))
    if (!hasWrites) return

    const hasNodeTreeWrites = actions.some((action) => isNodeTreeWriteAction(runtime, action))
    if (hasNodeTreeWrites) {
      const liveNodeTree = toolHost.getNodeTree?.()
      if (liveNodeTree) {
        toolHost.onNodeTreeChanged?.(liveNodeTree)
      }
    }

    const hasDataSetWrites = actions.some((action) => isDataSetWriteAction(runtime, action))
    if (hasDataSetWrites) {
      const liveDataSetTool = toolHost.getDataSetTool?.()
      if (liveDataSetTool) {
        toolHost.onDataSetChanged?.(liveDataSetTool)
      }
    }
  }

  /**
   * 时序步骤 1：bootstrap
   *
  * 目标：把 live rule/script/style 注入到 page-design 编辑状态，建立本轮编辑基线。
   */
  async function bootstrap(bootstrapOptions?: PageModelEditBootstrapOptions): Promise<PageModelFunctionContext> {
    if (!bootstrapOptions?.skipContextLoad) {
      await ensureContextLoaded?.()
    }
    if (sessionHost.hasSessionMismatch(getSessionKey())) {
      await sessionHost.reset()
      patchState({ ready: false })
    }

    const { context, editState } = ensureRuntime()
    const toolHost = getEditToolHost()
    const liveTree = toolHost.getNodeTree?.()
    const readScript = toolHost.readScript
    const readStyle = toolHost.readStyle
    const bootstrapAction = editInit.action

    if (!liveTree) {
      throw new Error(`${bootstrapAction} 失败：缺少 live SparkNodeTree，必须先加载当前页面 rule.json`)
    }
    if (!readScript) {
      throw new Error(`${bootstrapAction} 失败：缺少 live script.js 读取器`)
    }
    if (!readStyle) {
      throw new Error(`${bootstrapAction} 失败：缺少 live style.css 读取器`)
    }

    liveTree.toJSON()
    readScript()
    readStyle()

    const result = runtime.executeFunction(bootstrapAction, {}, context, 'bootstrap-page-model')

    if (!result.ok) {
      const message = formatFunctionFailure(result)
      if (!bootstrapOptions?.silent) {
        pushLog('error', bootstrapAction, message)
      }
      throw new Error(message)
    }

    patchState({
      nodeTree: runtime.getActiveNodeTree(editState),
      ready: true,
      dirty: false,
    })
    if (!bootstrapOptions?.silent) {
      pushLog('info', bootstrapAction, result.summary)
    }
    return context
  }

  /**
   * 时序步骤 2：runLlm
   *
   * 流程：
   * - 创建并登记本轮 runId 与 abortController。
   * - 保障会话就绪（可选跳过 bootstrap）。
   * - 启动编排循环并消费 SSE / tool turn。
   * - 统计写操作并执行页面模型回投。
   * - 在 finally 阶段统一收束 busy 与中止绑定。
   */
  async function runLlm(prompt: string, hooks?: PageModelEditRunOptions): Promise<void> {
    const runId = ++activeRunId
    const runController = new AbortController()
    abortActiveRun()
    runAbortController = runController
    const detachAbort = linkAbortSignal(hooks?.signal, runController)

    patchState({
      busy: true,
      aiBuffer: '',
    })
    try {
      const context = hooks?.skipBootstrap === true
        ? ensureRuntime().context
        : await bootstrap({ silent: true })
      pushLog('info', '人工输入', formatHumanInputForLog(hooks?.originalUserInput ?? prompt))
      pushLog('info', '开始 LLM 编辑', '已生成本轮上下文 prompt，准备调用模型')
      const repeatDetection: RepeatDetectionConfig = {
        maxSameSignature: 6,
        maxConsecutiveErrors: 6,
        maxCyclePeriod: 4,
        cycleRepeatThreshold: 2,
        maxReadOnlyActions: 20,
        maxRepeatedFailureRetries: 2,
        isReadOnlyAction: isPageDesignReadOnlyAction,
        getRepeatedFailureKey: getPageDesignRepeatedFailureKey,
        buildRepeatedFailureFollowUp: buildPageDesignRepeatedFailureFollowUp,
        buildCycleFollowUp: buildPageDesignCycleFollowUp,
        buildReadOnlyLimitFollowUp: buildPageDesignReadOnlyLimitFollowUp,
        ...hooks?.repeatDetection,
      }
      const result = await runtime.startIterateSession({
        backend: sessionHost.backend,
        context,
        userPrompt: prompt,
        systemPrompt: runtime.PAGE_DESIGN_EDIT_RUNTIME_PROMPT,
        maxRounds: hooks?.maxRounds ?? 80,
        slidingWindow: 12,
        signal: runController.signal,
        onSseEvent(event) {
          if (activeRunId !== runId || runController.signal.aborted) return
          onSseEvent(event, hooks)
        },
        ...sessionHost.getResumeSessionOptions(),
        tools: runtime.generateToolDefinitions({
          compactDescriptions: true,
          ...(hooks?.toolMode === 'describe-only' ? { types: ['describe'] } : {}),
        }),
        repeatDetection,
        onTurnComplete(turn: DialogueTurn) {
          if (turn.toolBlock?.action && turn.functionResult) {
            const functionResult = turn.functionResult
            if (functionResult.ok) {
              pushLog(
                'success',
                `✓ ${turn.toolBlock.action}`,
                functionResult.summary ?? JSON.stringify(functionResult.data, null, 2).slice(0, 300),
              )
            } else {
              pushLog('error', `✗ ${turn.toolBlock.action}`, functionResult.msg ?? '失败')
            }
          }

          const action = turn.toolBlock?.action
          if (
            turn.phase === 'function-execute'
            && action !== undefined
            && turn.functionResult?.ok
          ) {
            syncPageModelProjection([action])
          }
          if (turn.phase === 'function-execute') {
            hooks?.onToolTurn?.(turn)
          }
        },
      })
      if (runController.signal.aborted || activeRunId !== runId) {
        return
      }
      if (result.aborted) {
        sessionHost.setBackendSessionId(result.sessionId)
        throw new Error(`函数循环中止: ${result.abortReason}`)
      }
      sessionHost.setBackendSessionId(result.sessionId)
      const toolTurnCount = result.turns.filter((turn) => turn.phase === 'function-execute').length
      const writeActions = result.turns.flatMap((turn) => {
        const action = turn.toolBlock?.action
        return turn.phase === 'function-execute' && action !== undefined && isToolWriteAction(runtime, action) && turn.functionResult?.ok
          ? [action]
          : []
      })
      const writeCount = writeActions.length
      if (writeCount === 0) {
        const message = toolTurnCount === 0
          ? `本轮未执行工具，已保留会话上下文 (${result.rounds} 轮)，可继续补充指令。`
          : `本轮执行 ${toolTurnCount} 次只读工具，未写入当前页面模型；已保留会话上下文，可继续对话或手动接管。`
        pushLog('info', '未写入', message)
        hooks?.onRunComplete?.({ rounds: result.rounds, writeCount })
        return
      }

      syncPageModelProjection(writeActions)

      patchState({ dirty: writeCount > 0 })
      pushLog('success', '✅ 已同步', `已直接写入当前页面模型 (${result.rounds} 轮, ${writeCount} 次写操作)`)
      hooks?.onRunComplete?.({ rounds: result.rounds, writeCount })
    } catch (err) {
      if (runController.signal.aborted || activeRunId !== runId) {
        return
      }
      pushLog('error', '编辑失败', err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      detachAbort()
      if (runAbortController === runController) {
        runAbortController = null
      }
      if (activeRunId === runId) {
        patchState({ busy: false })
      }
    }
  }

  /**
   * 时序步骤 3：reset
   *
   * 语义：
   * - 中止活动运行。
   * - 若宿主由内部创建，则同步重置宿主。
   * - 清空本地会话状态与日志。
   */
  function reset(): void {
    abortActiveRun()
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
    setState({
      ready: false,
      dirty: false,
      busy: false,
      aiBuffer: '',
      log: [],
      nodeTree: null,
    })
  }

  /** 清空日志，不影响会话与 busy 状态。 */
  function clearLog(): void {
    patchState({ log: [] })
  }

  /**
   * 时序步骤 4：dispose
   *
   * 与 reset 的区别：
   * - dispose 只处理运行与宿主释放，不主动重置本地状态快照。
   * - 适用于组件卸载或上层统一接管状态场景。
   */
  function dispose(): void {
    abortActiveRun()
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
  }

  /** 注册状态监听并返回取消函数。 */
  function subscribe(listener: (currentState: Readonly<PageModelEditSessionState>) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    getState: () => state,
    subscribe,
    bootstrap,
    runLlm,
    reset,
    clearLog,
    dispose,
  }
}