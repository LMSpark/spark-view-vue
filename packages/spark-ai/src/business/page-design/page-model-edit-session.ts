import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DialogueTurn, OrchestratorResult, SessionBackend, ToolDefinition } from '../../core/session/session-contracts'
import { runStillsLoop } from '../../core/orchestration/session-orchestrator'
import { generateToolDefinitions, functionNameToAction } from '../../core/fc-schema'
import { STILLS_EDIT_RUNTIME_PROMPT } from '../../core/stills/stills-prompts'
import type { IStillSession, StillResult } from '../../core/stills/types'
import { createDefaultFollowUpPolicy } from '../project-planning/business-follow-up-policy'
import {
  createRepeatDetectionMonitor,
  type RepeatDetectionConfig,
} from '../project-planning/repeat-detection-monitor'
import { executeStill } from '../../stills'
import {
  getActiveNodeTree,
  getEditState,
  isEditDataSetWriteAction,
  isEditNodeTreeWriteAction,
  isEditWriteAction,
  type EditToolHost,
} from './stills'
import {
  createPageModelSessionHost,
  type PageModelSessionHostRuntime,
  type PageModelStillsSession,
} from './page-model-session-host'

const FALLBACK_TOOL_WRITE_SET = new Set<string>([
  'sparkNodeTree.addNode',
  'sparkNodeTree.addNodes',
  'sparkNodeTree.setProps',
  'sparkNodeTree.setPropsBatch',
  'sparkNodeTree.replaceNode',
  'sparkNodeTree.replaceNodes',
  'sparkNodeTree.removeNode',
  'sparkNodeTree.removeNodes',
  'datasetTool.createTable',
  'datasetTool.createTables',
  'datasetTool.updateTable',
  'datasetTool.removeTable',
  'datasetTool.createColumn',
  'datasetTool.updateColumn',
  'datasetTool.removeColumn',
  'datasetTool.setTableMeta',
  'datasetTool.setColumnMeta',
  'datasetTool.upsertTableMeta',
  'datasetTool.upsertColumnMeta',
  'datasetTool.writePagedata',
  'datasetTool.replaceAll',
  'datasetTool.syncDataSet',
  'textModel.writeScript',
  'textModel.writeStyle',
])

export interface PageModelEditLogEntry {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
}

export interface PageModelEditSessionState {
  ready: boolean
  dirty: boolean
  busy: boolean
  aiBuffer: string
  log: PageModelEditLogEntry[]
  nodeTree: SparkNodeTree | null
}

export interface StartPageModelIterateSessionOptions {
  backend: SessionBackend
  session: IStillSession
  userPrompt: string
  systemPrompt: string
  maxRounds?: number
  slidingWindow?: number
  resumeSessionId?: string
  signal?: AbortSignal
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
  onTurnComplete?: (turn: DialogueTurn) => void
  tools?: ToolDefinition[]
  repeatDetection?: RepeatDetectionConfig
}

export interface PageModelEditSessionRuntime {
  executeStill: typeof executeStill
  startIterateSession: (options: StartPageModelIterateSessionOptions) => Promise<OrchestratorResult>
  generateToolDefinitions: typeof generateToolDefinitions
  functionNameToAction: typeof functionNameToAction
  STILLS_EDIT_RUNTIME_PROMPT: string
  getEditState: typeof getEditState
  getActiveNodeTree: typeof getActiveNodeTree
  isEditWriteAction?: (value: string) => boolean
  isEditNodeTreeWriteAction?: (value: string) => boolean
  isEditDataSetWriteAction?: (value: string) => boolean
}

export interface PageModelEditSessionOptions {
  getSessionKey: () => string
  getEditToolHost: () => EditToolHost
  sessionHost?: PageModelSessionHostRuntime
  ensureContextLoaded?: () => Promise<void>
  runtime?: Partial<PageModelEditSessionRuntime>
}

export interface PageModelEditRunHooks {
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  onToolTurn?: (turn: DialogueTurn) => void
  onRunComplete?: (payload: { rounds: number; writeCount: number }) => void
  signal?: AbortSignal
}

export interface PageModelEditRunOptions extends PageModelEditRunHooks {
  skipBootstrap?: boolean
}

export interface PageModelEditBootstrapOptions {
  silent?: boolean
  skipContextLoad?: boolean
}

export interface PageModelEditSessionController {
  getState: () => Readonly<PageModelEditSessionState>
  subscribe: (listener: (state: Readonly<PageModelEditSessionState>) => void) => () => void
  bootstrap: (options?: PageModelEditBootstrapOptions) => Promise<PageModelStillsSession>
  runLlm: (prompt: string, hooks?: PageModelEditRunOptions) => Promise<void>
  reset: () => void
  dispose: () => void
}

function startPageModelIterateSession(
  options: StartPageModelIterateSessionOptions,
): Promise<OrchestratorResult> {
  return runStillsLoop(options.userPrompt, options.session, options.backend, {
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

const DEFAULT_RUNTIME: PageModelEditSessionRuntime = {
  executeStill,
  startIterateSession: startPageModelIterateSession,
  generateToolDefinitions,
  functionNameToAction,
  STILLS_EDIT_RUNTIME_PROMPT,
  getEditState,
  getActiveNodeTree,
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
}

function isToolWriteAction(runtime: PageModelEditSessionRuntime, action: string): boolean {
  return runtime.isEditWriteAction ? runtime.isEditWriteAction(action) : FALLBACK_TOOL_WRITE_SET.has(action)
}

function isNodeTreeWriteAction(runtime: PageModelEditSessionRuntime, action: string): boolean {
  return runtime.isEditNodeTreeWriteAction
    ? runtime.isEditNodeTreeWriteAction(action)
    : action.startsWith('sparkNodeTree.') && isToolWriteAction(runtime, action)
}

function isDataSetWriteAction(runtime: PageModelEditSessionRuntime, action: string): boolean {
  return runtime.isEditDataSetWriteAction
    ? runtime.isEditDataSetWriteAction(action)
    : action.startsWith('datasetTool.') && isToolWriteAction(runtime, action)
}

export function createPageModelEditSession(
  options: PageModelEditSessionOptions,
): PageModelEditSessionController {
  const { getSessionKey, getEditToolHost, ensureContextLoaded } = options
  const runtime: PageModelEditSessionRuntime = {
    ...DEFAULT_RUNTIME,
    ...options.runtime,
  }
  const ownsSessionHost = options.sessionHost === undefined
  const sessionHost = options.sessionHost ?? createPageModelSessionHost({
    getEditToolHost,
    getSessionKey,
  })

  let state: PageModelEditSessionState = {
    ready: false,
    dirty: false,
    busy: false,
    aiBuffer: '',
    log: [],
    nodeTree: null,
  }
  const listeners = new Set<(state: Readonly<PageModelEditSessionState>) => void>()
  const LOG_LIMIT = 200
  let activeRunId = 0
  let runAbortController: AbortController | null = null

  function notify(): void {
    const snapshot: PageModelEditSessionState = {
      ...state,
      log: [...state.log],
    }
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  function setState(nextState: PageModelEditSessionState): void {
    state = nextState
    notify()
  }

  function patchState(patch: Partial<PageModelEditSessionState>): void {
    setState({
      ...state,
      ...patch,
    })
  }

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
    nextLog.push({ type, tag, text })
    if (nextLog.length > LOG_LIMIT) {
      nextLog.splice(0, nextLog.length - LOG_LIMIT)
    }
    patchState({ log: nextLog })
  }

  function ensureSession(): PageModelStillsSession {
    const ensured = sessionHost.ensureSession()
    patchState({
      ready: true,
      dirty: false,
      nodeTree: runtime.getActiveNodeTree(runtime.getEditState(ensured.session)),
    })
    if (ensured.bootstrapped) {
      pushLog('info', 'session-ready', '编辑会话已挂接到当前页面模型；后续读写仅通过 FC 工具执行')
    }
    return ensured.session
  }

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

  function abortActiveRun(): void {
    runAbortController?.abort()
    runAbortController = null
  }

  function onSseEvent(event: { sessionId: string; type: string; data: string }, hooks?: PageModelEditRunHooks): void {
    if (event.type === 'delta') {
      patchState({ aiBuffer: state.aiBuffer + event.data })
      hooks?.onDelta?.(event.data)
      pushLog('info', 'SSE delta', event.data, { merge: true })
      return
    }

    if (event.type === 'reasoning') {
      hooks?.onReasoning?.(event.data)
      pushLog('info', 'SSE reasoning', event.data, { merge: true })
      return
    }

    if (event.type === 'result') {
      pushLog('success', 'SSE result', event.data)
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
      pushLog('error', 'SSE 错误', event.data)
      patchState({ aiBuffer: '' })
      return
    }

    pushLog('info', `SSE ${event.type}`, event.data || '(empty)')
  }

  function formatStillFailure(result: Extract<StillResult, { ok: false }>): string {
    return `${result.msg}\n修复建议: ${result.fix}`
  }

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

  async function bootstrap(bootstrapOptions?: PageModelEditBootstrapOptions): Promise<PageModelStillsSession> {
    if (!bootstrapOptions?.skipContextLoad) {
      await ensureContextLoaded?.()
    }
    if (sessionHost.hasSessionMismatch(getSessionKey())) {
      await sessionHost.reset()
      patchState({ ready: false })
    }

    const session = ensureSession()
    const toolHost = getEditToolHost()
    const liveTree = toolHost.getNodeTree?.()
    const readScript = toolHost.readScript
    const readStyle = toolHost.readStyle

    if (!liveTree) {
      throw new Error('edit.bootstrap 失败：缺少 live SparkNodeTree，必须先加载当前页面 rule.json')
    }
    if (!readScript) {
      throw new Error('edit.bootstrap 失败：缺少 live script.js 读取器')
    }
    if (!readStyle) {
      throw new Error('edit.bootstrap 失败：缺少 live style.css 读取器')
    }

    void liveTree.toJSON()
    void readScript()
    void readStyle()

    const result = runtime.executeStill('edit.bootstrap', {}, session, 'bootstrap-page-model')

    if (!result.ok) {
      const message = formatStillFailure(result)
      if (!bootstrapOptions?.silent) {
        pushLog('error', 'edit.bootstrap', message)
      }
      throw new Error(message)
    }

    patchState({
      nodeTree: runtime.getActiveNodeTree(runtime.getEditState(session)),
      ready: true,
      dirty: false,
    })
    if (!bootstrapOptions?.silent) {
      pushLog('info', 'edit.bootstrap', result.summary)
    }
    return session
  }

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
      const session = hooks?.skipBootstrap === true
        ? ensureSession()
        : await bootstrap({ silent: true })
      pushLog('info', '开始 LLM 编辑', `需求: ${prompt}`)
      const result = await runtime.startIterateSession({
        backend: sessionHost.backend,
        session,
        userPrompt: prompt,
        systemPrompt: runtime.STILLS_EDIT_RUNTIME_PROMPT,
        maxRounds: 80,
        slidingWindow: 12,
        signal: runController.signal,
        onSseEvent(event) {
          if (activeRunId !== runId || runController.signal.aborted) return
          onSseEvent(event, hooks)
        },
        ...sessionHost.getResumeSessionOptions(),
        tools: runtime.generateToolDefinitions({ compactDescriptions: true }),
        repeatDetection: {
          maxSameSignature: 6,
          maxConsecutiveErrors: 6,
          maxCyclePeriod: 4,
          cycleRepeatThreshold: 2,
          maxReadOnlyActions: 36,
          maxMissingComponentRetries: 2,
        },
        onTurnComplete(turn: DialogueTurn) {
          if (turn.toolBlock?.action && turn.stillsResult) {
            const stillsResult = turn.stillsResult
            if (stillsResult.ok) {
              pushLog(
                'success',
                `✓ ${turn.toolBlock.action}`,
                stillsResult.summary ?? JSON.stringify(stillsResult.data, null, 2).slice(0, 300),
              )
            } else {
              pushLog('error', `✗ ${turn.toolBlock.action}`, stillsResult.msg ?? '失败')
            }
          }

          const action = turn.toolBlock?.action
          if (
            turn.phase === 'stills-execute'
            && action !== undefined
            && turn.stillsResult?.ok
          ) {
            syncPageModelProjection([action])
          }
          if (turn.phase === 'stills-execute') {
            hooks?.onToolTurn?.(turn)
          }
        },
      })
      if (runController.signal.aborted || activeRunId !== runId) {
        return
      }
      if (result.aborted) {
        sessionHost.setBackendSessionId(result.sessionId)
        throw new Error(`Stills 中止: ${result.abortReason}`)
      }
      const toolTurnCount = result.turns.filter((turn) => turn.phase === 'stills-execute').length
      if (toolTurnCount === 0) {
        sessionHost.setBackendSessionId(null)
        throw new Error('本轮未触发任何工具调用，已丢弃后端会话。请重试；若持续复现，请重置当前页面模型会话。')
      }

      sessionHost.setBackendSessionId(result.sessionId)
      const writeActions = result.turns.flatMap((turn) => {
        const action = turn.toolBlock?.action
        return turn.phase === 'stills-execute' && action !== undefined && isToolWriteAction(runtime, action) && turn.stillsResult?.ok
          ? [action]
          : []
      })
      const writeCount = writeActions.length
      if (writeCount === 0) {
        sessionHost.setBackendSessionId(null)
        throw new Error('本轮仅执行了只读工具，未对当前页面模型产生写入。已丢弃后端会话，请重试。')
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

  function dispose(): void {
    abortActiveRun()
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
  }

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
    dispose,
  }
}