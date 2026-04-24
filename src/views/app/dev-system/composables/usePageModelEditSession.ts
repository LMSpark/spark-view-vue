/**
 * usePageModelEditSession
 *
 * Tool layer for page-model stills-based editing.
 * Owns: stills session lifecycle, bootstrap, tool execution, LLM loop, SSE events, export.
 * Does NOT own: UI state (mode, requestText), emit calls (passed as callbacks).
 *
 * LLM-driven edits go through this composable.
 */

import { ref, shallowRef, onUnmounted } from 'vue'
import {
  getActiveNodeTree,
  executeStill,
  startIterateSession,
  generateToolDefinitions,
  functionNameToAction,
  STILLS_EDIT_RUNTIME_PROMPT,
  getEditState,
  type IStillSession,
  type DialogueTurn,
  type StillResult,
  type EditToolHost,
} from '../ai-bridge'
import type { SparkNodeTree } from '@spark-view/spark-component'
import { usePageModelSessionHost } from './usePageModelSessionHost'
import type { PageModelSessionHost } from './usePageModelSessionHost'

const TOOL_WRITE_SET = new Set<string>([
  'sparkNodeTree.addNode',
  'sparkNodeTree.addNodes',
  'sparkNodeTree.setProps',
  'sparkNodeTree.setPropsBatch',
  'sparkNodeTree.replaceNode',
  'sparkNodeTree.replaceNodes',
  'sparkNodeTree.removeNode',
  'sparkNodeTree.removeNodes',
])

function isDatasetWriteAction(action: string): boolean {
  if (!action.startsWith('datasetTool.')) return false
  return !(
    action === 'datasetTool.export'
    || action === 'datasetTool.historyCursor'
    || action.startsWith('datasetTool.can')
    || action.startsWith('datasetTool.get')
    || action.startsWith('datasetTool.list')
  )
}

function isToolWriteAction(action: string): boolean {
  return TOOL_WRITE_SET.has(action) || isDatasetWriteAction(action)
}

// ── Log entry type ─────────────────────────────────────────────────────────────

export interface LogEntry {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
}

// ── Composable ────────────────────────────────────────────────────────────────

type StillsSession = IStillSession

export interface PageModelEditSessionOptions {
  /** Returns the current page-scoped session key, usually pageId. */
  getSessionKey: () => string
  /** Returns the single live tool host shared with manual editing. */
  getEditToolHost: () => EditToolHost
  /** Optional shared page-model session host. */
  sessionHost?: PageModelSessionHost
  /** Ensures page context files are loaded before first bootstrap. */
  ensureContextLoaded?: () => Promise<void>
  /** Called to surface user-facing status messages. */
  onStatus: (msg: string, type: 'success' | 'warning' | 'error') => void
}

export interface PageModelEditRunHooks {
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  signal?: AbortSignal
}

interface PageModelEditRunOptions extends PageModelEditRunHooks {
  /**
   * 已由外层完成 bootstrap 时可置 true，避免重复加载上下文。
   * 默认 false。
   */
  skipBootstrap?: boolean
}

interface PageModelEditBootstrapOptions {
  silent?: boolean
  skipContextLoad?: boolean
}

export function usePageModelEditSession(options: PageModelEditSessionOptions) {
  const { getSessionKey, getEditToolHost, ensureContextLoaded, onStatus } = options
  const ownsSessionHost = options.sessionHost === undefined

  const sessionHost = options.sessionHost ?? usePageModelSessionHost({
    getEditToolHost,
    getSessionKey,
  })

  const ready = ref(false)
  const dirty = ref(false)
  const busy = ref(false)
  const aiBuffer = ref('')
  const log = ref<LogEntry[]>([])
  const LOG_LIMIT = 200
  const nodeTree = shallowRef<SparkNodeTree | null>(null)
  let activeRunId = 0
  let runAbortController: AbortController | null = null

  // ── Internal helpers ────────────────────────────────────────────────────────

  function pushLog(type: LogEntry['type'], tag: string, text: string, logOptions?: { merge?: boolean }) {
    if (logOptions?.merge) {
      const last = log.value.at(-1)
      if (last?.type === type && last.tag === tag) {
        last.text += text
        return
      }
    }
    log.value.push({ type, tag, text })
    if (log.value.length > LOG_LIMIT) {
      log.value.splice(0, log.value.length - LOG_LIMIT)
    }
  }

  function ensureSession(): StillsSession {
    const ensured = sessionHost.ensureSession()
    ready.value = true
    dirty.value = false
    nodeTree.value = getActiveNodeTree(getEditState(ensured.session))
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

  function abortActiveRun() {
    runAbortController?.abort()
    runAbortController = null
  }

  function onSseEvent(event: { sessionId: string; type: string; data: string }, hooks?: PageModelEditRunHooks) {
    if (event.type === 'delta') {
      aiBuffer.value += event.data
      hooks?.onDelta?.(event.data)
      pushLog('info', 'SSE delta', event.data, { merge: true })
    } else if (event.type === 'reasoning') {
      hooks?.onReasoning?.(event.data)
      pushLog('info', 'SSE reasoning', event.data, { merge: true })
    } else if (event.type === 'result') {
      pushLog('success', 'SSE result', event.data)
      try {
        const parsed = JSON.parse(event.data) as {
          toolCalls?: Array<{ function?: { name?: string } }>
        }
        const actions = (parsed.toolCalls ?? [])
          .map(tc => tc.function?.name)
          .filter((n): n is string => Boolean(n))
          .map(name => functionNameToAction(name))
        if (aiBuffer.value || actions.length > 0) {
          pushLog(
            'info',
            actions.length > 0 ? `LLM → ${actions.join(', ')}` : 'LLM 响应',
            aiBuffer.value || '(无文本)',
          )
        }
      } catch {
        if (aiBuffer.value) pushLog('info', 'LLM 响应', aiBuffer.value)
      }
      aiBuffer.value = ''
    } else if (event.type === 'error') {
      pushLog('error', 'SSE 错误', event.data)
      aiBuffer.value = ''
    } else {
      pushLog('info', `SSE ${event.type}`, event.data || '(empty)')
    }
  }

  function formatStillFailure(result: Extract<StillResult, { ok: false }>): string {
    return `${result.msg}\n修复建议: ${result.fix}`
  }

  function syncPageModelProjection(actions: readonly string[]): void {
    const hasNodeTreeWrites = actions.some(action => TOOL_WRITE_SET.has(action))
    const hasDataSetWrites = actions.some(action => isDatasetWriteAction(action))
    if (!hasNodeTreeWrites && !hasDataSetWrites) return

    const toolHost = getEditToolHost()
    if (hasNodeTreeWrites) {
      const liveNodeTree = toolHost.getNodeTree?.()
      if (liveNodeTree) {
        toolHost.onNodeTreeChanged?.(liveNodeTree)
      }
    }
    if (hasDataSetWrites) {
      const liveDataSetTool = toolHost.getDataSetTool?.()
      if (liveDataSetTool) {
        toolHost.onDataSetChanged?.(liveDataSetTool)
      }
    }
  }

  async function bootstrap(bootstrapOptions?: PageModelEditBootstrapOptions): Promise<StillsSession> {
    if (!bootstrapOptions?.skipContextLoad) {
      await ensureContextLoaded?.()
    }
    if (sessionHost.hasSessionMismatch(getSessionKey())) {
      await sessionHost.reset()
      ready.value = false
    }

    const session = ensureSession()
    const toolHost = getEditToolHost()
    const liveTree = toolHost.getNodeTree?.()
    const liveDataSetTool = toolHost.getDataSetTool?.()
    const readScript = toolHost.readScript
    const readStyle = toolHost.readStyle

    if (!liveTree) {
      throw new Error('edit.bootstrap 失败：缺少 live SparkNodeTree，必须先加载当前页面 rule.json')
    }
    if (!liveDataSetTool) {
      throw new Error('edit.bootstrap 失败：缺少 live DataSetCrudTool，必须先加载当前页面 pagedata.json')
    }
    if (!readScript) {
      throw new Error('edit.bootstrap 失败：缺少 live script.js 读取器')
    }
    if (!readStyle) {
      throw new Error('edit.bootstrap 失败：缺少 live style.css 读取器')
    }

    void liveTree.toJSON()
    void liveDataSetTool.toJson()
    void readScript()
    void readStyle()

    const result = executeStill('edit.bootstrap', {}, session, 'bootstrap-page-model')

    if (!result.ok) {
      const message = formatStillFailure(result)
      if (!bootstrapOptions?.silent) {
        pushLog('error', 'edit.bootstrap', message)
      }
      throw new Error(message)
    }

    nodeTree.value = getActiveNodeTree(getEditState(session))
    ready.value = true
    dirty.value = false
    if (!bootstrapOptions?.silent) {
      pushLog('info', 'edit.bootstrap', result.summary)
    }
    return session
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Run the LLM orchestration loop for a given prompt (edit/chat mode). */
  async function runLlm(prompt: string, hooks?: PageModelEditRunOptions): Promise<void> {
    const runId = ++activeRunId
    const runController = new AbortController()
    abortActiveRun()
    runAbortController = runController
    const detachAbort = linkAbortSignal(hooks?.signal, runController)

    busy.value = true
    aiBuffer.value = ''
    try {
      const session = hooks?.skipBootstrap === true
        ? ensureSession()
        : await bootstrap({ silent: true })
      pushLog('info', '开始 LLM 编辑', `需求: ${prompt}`)
      const result = await startIterateSession({
        backend: sessionHost.backend,
        session,
        userPrompt: prompt,
        systemPrompt: STILLS_EDIT_RUNTIME_PROMPT,
        maxRounds: 80,
        slidingWindow: 12,
        signal: runController.signal,
        onSseEvent(event) {
          if (activeRunId !== runId || runController.signal.aborted) return
          onSseEvent(event, hooks)
        },
        ...sessionHost.getResumeSessionOptions(),
        tools: generateToolDefinitions({ compactDescriptions: true }),
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
            const r = turn.stillsResult
            if (r.ok) {
              pushLog('success', `✓ ${turn.toolBlock.action}`, r.summary ?? JSON.stringify(r.data, null, 2).slice(0, 300))
            } else {
              pushLog('error', `✗ ${turn.toolBlock.action}`, r.msg ?? '失败')
            }
          }
          // Real-time projection: notify live tool host on every successful
          // write so the 4 file tabs reflect AI edits immediately，而不是只在整轮编排结束后刷新。
          const action = turn.toolBlock?.action
          if (
            turn.phase === 'stills-execute'
            && action !== undefined
            && turn.stillsResult?.ok
          ) {
            syncPageModelProjection([action])
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
        return turn.phase === 'stills-execute' && action !== undefined && isToolWriteAction(action) && turn.stillsResult?.ok
          ? [action]
          : []
      })
      const writeCount = writeActions.length
      if (writeCount === 0) {
        sessionHost.setBackendSessionId(null)
        throw new Error('本轮仅执行了只读工具，未对当前页面模型产生写入。已丢弃后端会话，请重试。')
      }

      syncPageModelProjection(writeActions)

      dirty.value = writeCount > 0
      pushLog('success', '✅ 已同步', `已直接写入当前页面模型 (${result.rounds} 轮, ${writeCount} 次写操作)`)
      onStatus(`✅ 模型级编辑完成 (${result.rounds} 轮)`, 'success')
    } catch (err) {
      if (runController.signal.aborted || activeRunId !== runId) {
        return
      }
      pushLog('error', '编辑失败', err instanceof Error ? err.message : String(err))
      onStatus(`AI 操作失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
      throw err
    } finally {
      detachAbort()
      if (runAbortController === runController) {
        runAbortController = null
      }
      if (activeRunId === runId) {
        busy.value = false
      }
    }
  }

  /** Reset session (re-bootstrap on next use). */
  function reset() {
    abortActiveRun()
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
    ready.value = false
    dirty.value = false
    nodeTree.value = null
    log.value = []
    aiBuffer.value = ''
    busy.value = false
  }

  onUnmounted(() => {
    abortActiveRun()
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
  })

  return { ready, dirty, busy, aiBuffer, log, nodeTree, bootstrap, runLlm, reset }
}

