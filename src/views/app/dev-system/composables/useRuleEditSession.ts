/**
 * useRuleEditSession
 *
 * Tool layer for rule.json stills-based editing.
 * Owns: stills session lifecycle, bootstrap, tool execution, LLM loop, SSE events, export.
 * Does NOT own: UI state (mode, requestText), emit calls (passed as callbacks).
 *
 * Both manual tool invocations and LLM-driven edits go through this composable.
 */

import { ref, shallowRef, onUnmounted } from 'vue'
import {
  getActiveNodeTree,
  executeStill,
  runStillsLoop,
  createRepeatDetectionMonitor,
  generateToolDefinitions,
  functionNameToAction,
  STILLS_EDIT_RUNTIME_PROMPT,
  getEditState,
  type IStillSession,
  type DialogueTurn,
} from '@spark-view/spark-ai'
import type { SparkNode, SparkNodeTree } from '@spark-view/spark-component'
import type { EditLiveModelAdapter } from '@spark-view/spark-ai'
import { usePageModelSessionHost } from './usePageModelSessionHost'
import type { PageModelSessionHost } from './usePageModelSessionHost'

// ── Catalog constants (exported for template use) ─────────────────────────────

export const TOOL_READ_ACTIONS = [
  'sparkNodeTree.getNode',
  'sparkNodeTree.getLocation',
  'sparkNodeTree.hasNode',
  'sparkNodeTree.getParent',
  'sparkNodeTree.listChildren',
  'sparkNodeTree.countNodes',
  'sparkNodeTree.collectDataKeys',
  'sparkNodeTree.collectHandlerNames',
] as const

export const TOOL_WRITE_ACTIONS = [
  'sparkNodeTree.addNode',
  'sparkNodeTree.addNodes',
  'sparkNodeTree.setProps',
  'sparkNodeTree.setPropsBatch',
  'sparkNodeTree.replaceNode',
  'sparkNodeTree.replaceNodes',
  'sparkNodeTree.removeNode',
  'sparkNodeTree.removeNodes',
] as const

export const TOOL_WRITE_SET = new Set<string>(TOOL_WRITE_ACTIONS)

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

export const TOOL_PARAM_EXAMPLES: Record<string, string> = {
  'sparkNodeTree.getNode': JSON.stringify({ componentId: 'root' }, null, 2),
  'sparkNodeTree.getLocation': JSON.stringify({ componentId: 'root' }, null, 2),
  'sparkNodeTree.hasNode': JSON.stringify({ componentId: 'root' }, null, 2),
  'sparkNodeTree.getParent': JSON.stringify({ componentId: 'root' }, null, 2),
  'sparkNodeTree.listChildren': JSON.stringify({ parentComponentId: null }, null, 2),
  'sparkNodeTree.countNodes': JSON.stringify({}, null, 2),
  'sparkNodeTree.collectDataKeys': JSON.stringify({}, null, 2),
  'sparkNodeTree.collectHandlerNames': JSON.stringify({}, null, 2),
  'sparkNodeTree.addNode': JSON.stringify(
    { parentComponentId: null, node: { type: 'r-button', id: 'my-btn', props: { label: '按钮' } } },
    null, 2
  ),
  'sparkNodeTree.addNodes': JSON.stringify(
    { parentComponentId: null, nodes: [{ type: 'r-button', id: 'btn-a', props: { label: 'A' } }] },
    null, 2
  ),
  'sparkNodeTree.setProps': JSON.stringify(
    { componentId: 'root', props: { key: 'value' }, merge: true },
    null, 2
  ),
  'sparkNodeTree.setPropsBatch': JSON.stringify(
    { items: [{ componentId: 'root', props: { key: 'value' }, merge: true }] },
    null, 2
  ),
  'sparkNodeTree.replaceNode': JSON.stringify(
    { componentId: 'root', node: { type: 'r-button', id: 'root', props: {} } },
    null, 2
  ),
  'sparkNodeTree.replaceNodes': JSON.stringify(
    { items: [{ componentId: 'root', node: { type: 'r-button', id: 'root', props: {} } }] },
    null, 2
  ),
  'sparkNodeTree.removeNode': JSON.stringify({ componentId: 'target-id' }, null, 2),
  'sparkNodeTree.removeNodes': JSON.stringify({ componentIds: ['target-id'] }, null, 2),
}

// ── Log entry type ─────────────────────────────────────────────────────────────

export interface LogEntry {
  type: 'info' | 'success' | 'error'
  tag: string
  text: string
}

// ── Composable ────────────────────────────────────────────────────────────────

type StillsSession = IStillSession

export interface RuleEditSessionOptions {
  /** Returns the current page-scoped session key, usually pageId. */
  getSessionKey: () => string
  /** Returns the single live model adapter shared with manual editing. */
  getLiveModelAdapter: () => EditLiveModelAdapter
  /** Optional shared page-model session host. */
  sessionHost?: PageModelSessionHost
  /** Ensures page context files are loaded before first bootstrap. */
  ensureContextLoaded?: () => Promise<void>
  /** Called to surface user-facing status messages. */
  onStatus: (msg: string, type: 'success' | 'warning' | 'error') => void
}

export interface RuleEditRunHooks {
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  signal?: AbortSignal
}

export function useRuleEditSession(options: RuleEditSessionOptions) {
  const { getSessionKey, getLiveModelAdapter, ensureContextLoaded, onStatus } = options
  const ownsSessionHost = options.sessionHost === undefined

  const sessionHost = options.sessionHost ?? usePageModelSessionHost({
    getLiveModelAdapter,
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
      pushLog('info', 'session-ready', '编辑会话已挂接到当前页面 live model；后续读写仅通过 FC 工具执行')
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

  function onSseEvent(event: { sessionId: string; type: string; data: string }, hooks?: RuleEditRunHooks) {
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

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Execute a single sparkNodeTree.* tool directly (manual/tool mode). */
  function execTool(action: string, paramsJson: string): void {
    busy.value = true
    try {
      let params: unknown
      try {
        params = JSON.parse(paramsJson || '{}')
      } catch {
        pushLog('error', '参数错误', '参数不是合法 JSON，请检查输入')
        return
      }
      const s = ensureSession()
      const result = executeStill(action, params as Record<string, unknown>, s, 'manual')
      if (result.ok) {
        pushLog(
          'success',
          `✓ ${action}`,
          result.summary
            ? `${result.summary}\n\n${JSON.stringify(result.data, null, 2)}`
            : JSON.stringify(result.data, null, 2),
        )
        if (TOOL_WRITE_SET.has(action)) {
          dirty.value = true
        }
      } else {
        pushLog('error', `✗ ${action}`, `${result.msg}${result.fix ? `\n修复建议: ${result.fix}` : ''}`)
      }
    } catch (err) {
      pushLog('error', '异常', err instanceof Error ? err.message : String(err))
    } finally {
      busy.value = false
    }
  }

  /** Run the LLM orchestration loop for a given prompt (edit/chat mode). */
  async function runLlm(prompt: string, hooks?: RuleEditRunHooks): Promise<void> {
    const runId = ++activeRunId
    const runController = new AbortController()
    abortActiveRun()
    runAbortController = runController
    const detachAbort = linkAbortSignal(hooks?.signal, runController)

    busy.value = true
    aiBuffer.value = ''
    try {
      await ensureContextLoaded?.()
      if (sessionHost.hasSessionMismatch(getSessionKey())) {
        await sessionHost.reset()
        ready.value = false
      }
      const s = ensureSession()
      pushLog('info', '开始 LLM 编辑', `需求: ${prompt}`)
      const result = await runStillsLoop(prompt, s, sessionHost.backend, {
        maxRounds: 80,
        slidingWindow: 12,
        systemPrompt: STILLS_EDIT_RUNTIME_PROMPT,
        signal: runController.signal,
        onSseEvent(event) {
          if (activeRunId !== runId || runController.signal.aborted) return
          onSseEvent(event, hooks)
        },
        ...sessionHost.getResumeSessionOptions(),
        tools: generateToolDefinitions({ compactDescriptions: true }),
        // 编辑会话需要允许短暂探索，但应及时阻断“只查不写”的漫游。
        monitors: [createRepeatDetectionMonitor({
          maxSameSignature: 6,
          maxConsecutiveErrors: 6,
          maxCyclePeriod: 4,
          cycleRepeatThreshold: 2,
          maxReadOnlyActions: 36,
          maxMissingComponentRetries: 2,
        })],
        onTurnComplete(turn: DialogueTurn) {
          if (turn.toolBlock?.action && turn.stillsResult) {
            const r = turn.stillsResult
            if (r.ok) {
              pushLog('success', `✓ ${turn.toolBlock.action}`, r.summary ?? JSON.stringify(r.data, null, 2).slice(0, 300))
            } else {
              pushLog('error', `✗ ${turn.toolBlock.action}`, r.msg ?? '失败')
            }
          }
          // Real-time projection: notify live model adapter on every successful
          // write so the 4 file tabs reflect AI edits immediately (rather than
          // only after the full runStillsLoop completes).
          const action = turn.toolBlock?.action
          if (
            turn.phase === 'stills-execute'
            && action !== undefined
            && turn.stillsResult?.ok
          ) {
            const adapter = getLiveModelAdapter()
            if (TOOL_WRITE_SET.has(action)) {
              const liveNodeTree = adapter.getNodeTree?.()
              if (liveNodeTree) adapter.onNodeTreeChanged?.(liveNodeTree)
            } else if (isDatasetWriteAction(action)) {
              const liveDataSetTool = adapter.getDataSetTool?.()
              if (liveDataSetTool) adapter.onDataSetChanged?.(liveDataSetTool)
            }
          }
        },
      })
      if (runController.signal.aborted || activeRunId !== runId) {
        return
      }
      sessionHost.setBackendSessionId(result.sessionId)
      if (result.aborted) throw new Error(`Stills 中止: ${result.abortReason}`)
      const writeActions = result.turns.flatMap((turn) => {
        const action = turn.toolBlock?.action
        return turn.phase === 'stills-execute' && action !== undefined && isToolWriteAction(action) && turn.stillsResult?.ok
          ? [action]
          : []
      })
      const writeCount = writeActions.length
      const hasNodeTreeWrites = writeActions.some(action => TOOL_WRITE_SET.has(action))
      const hasDataSetWrites = writeActions.some(action => isDatasetWriteAction(action))

      if (hasNodeTreeWrites || hasDataSetWrites) {
        const liveModelAdapter = getLiveModelAdapter()
        if (hasNodeTreeWrites) {
          const liveNodeTree = liveModelAdapter.getNodeTree?.()
          if (liveNodeTree) {
            liveModelAdapter.onNodeTreeChanged?.(liveNodeTree)
          }
        }
        if (hasDataSetWrites) {
          const liveDataSetTool = liveModelAdapter.getDataSetTool?.()
          if (liveDataSetTool) {
            liveModelAdapter.onDataSetChanged?.(liveDataSetTool)
          }
        }
      }

      dirty.value = writeCount > 0
      if (writeCount > 0) {
        pushLog('success', '✅ 已同步', `已直接写入当前页面 live model (${result.rounds} 轮, ${writeCount} 次写操作)`)
      } else {
        pushLog('info', `${result.rounds} 轮完成`, '未检测到写操作')
      }
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

  function loadRuleDocument(ruleJson: SparkNode[]): void {
    const tree = nodeTree.value
    if (!tree) return
    tree.loadRoot({ type: 'page', children: ruleJson })
  }

  /** Sync externally edited rule JSON text into the session's SparkNodeTree (loadRoot). */
  function loadRuleJson(ruleJsonText: string): void {
    let parsed: SparkNode[]
    try {
      const raw = JSON.parse(ruleJsonText) as unknown
      parsed = Array.isArray(raw) ? (raw as SparkNode[]) : []
    } catch {
      return
    }
    loadRuleDocument(parsed)
  }

  onUnmounted(() => {
    abortActiveRun()
    if (ownsSessionHost) {
      sessionHost.resetSync()
    }
  })

  return { ready, dirty, busy, aiBuffer, log, nodeTree, execTool, runLlm, reset, loadRuleDocument, loadRuleJson }
}
