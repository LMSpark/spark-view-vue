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
  clearRegistry,
  clearDomains,
  registerEditStills,
  createSession as createStillSession,
  executeStill,
  runStillsLoop,
  SessionBackendImpl,
  configureSessionBackend,
  createRepeatDetectionMonitor,
  generateToolDefinitions,
  STILLS_EDIT_RUNTIME_PROMPT,
  getEditState,
  type DialogueTurn,
} from '@spark-view/spark-ai'
import type { SparkNode, SparkNodeTree } from '@spark-view/spark-component'
import { createAuthHeaders } from '@/services/http'

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

type StillsSession = ReturnType<typeof createStillSession>

export interface RuleEditSessionOptions {
  /** Returns the 4 page files for bootstrap params. */
  getContextFiles: () => Record<string, string>
  /** Called when an AI export is ready; receives all changed files (rule.json, pagedata.json, script.js, style.css). */
  onApply: (files: Record<string, string>) => void
  /** Called to surface user-facing status messages. */
  onStatus: (msg: string, type: 'success' | 'warning' | 'error') => void
}

export function useRuleEditSession(options: RuleEditSessionOptions) {
  const { getContextFiles, onApply, onStatus } = options

  // Single stable backend instance — not reactive (no template binding needed)
  const backend = new SessionBackendImpl()
  let backendSessionId: string | null = null

  const session = shallowRef<StillsSession | null>(null)
  const ready = ref(false)
  const dirty = ref(false)
  const busy = ref(false)
  const aiBuffer = ref('')
  const log = ref<LogEntry[]>([])
  const nodeTree = shallowRef<SparkNodeTree | null>(null)

  // ── Internal helpers ────────────────────────────────────────────────────────

  function pushLog(type: LogEntry['type'], tag: string, text: string) {
    log.value.unshift({ type, tag, text })
    if (log.value.length > 30) log.value.splice(30)
  }

  function buildBootstrapParams() {
    const files = getContextFiles()
    const ruleRaw = files['rule.json'] ?? ''
    // pagedata.json is optional context for the AI; fall back to {} when not yet loaded.
    const pagedataRaw = files['pagedata.json']?.trim() ? files['pagedata.json'] : '{}'

    if (!ruleRaw.trim()) throw new Error('缺少 rule.json')

    const parsedRule = JSON.parse(ruleRaw) as unknown
    const parsedPageData = JSON.parse(pagedataRaw) as unknown

    const ruleJson = Array.isArray(parsedRule)
      ? parsedRule
      : (
          typeof parsedRule === 'object' &&
          parsedRule !== null &&
          Array.isArray((parsedRule as Record<string, unknown>)['children'])
        )
          ? (parsedRule as Record<string, unknown>)['children'] as unknown[]
          : null

    if (!Array.isArray(ruleJson)) {
      throw new Error('rule.json 必须是数组或含 children 的根对象')
    }
    if (typeof parsedPageData !== 'object' || parsedPageData === null || Array.isArray(parsedPageData)) {
      throw new Error('pagedata.json 必须是对象')
    }

    return {
      ruleJson,
      pageDataJson: parsedPageData as Record<string, unknown>,
      scriptJs: files['script.js'] ?? '',
      styleCss: files['style.css'] ?? '',
    }
  }

  function ensureSession(): StillsSession {
    if (session.value && ready.value) return session.value
    clearRegistry()
    clearDomains()
    registerEditStills()
    const s = createStillSession()
    const boot = executeStill('edit.bootstrap', buildBootstrapParams(), s, 'bootstrap')
    if (!boot.ok) throw new Error(`bootstrap 失败: ${boot.msg}`)
    session.value = s
    ready.value = true
    dirty.value = false
    nodeTree.value = getEditState(s).nodeTree
    pushLog('info', 'bootstrap', 'edit.bootstrap 完成，4 个文件已进入同一编辑会话')
    return s
  }

  function onSseEvent(event: { sessionId: string; type: string; data: string }) {
    if (event.type === 'delta') {
      aiBuffer.value += event.data
    } else if (event.type === 'result') {
      try {
        const parsed = JSON.parse(event.data) as {
          toolCalls?: Array<{ function?: { name?: string } }>
        }
        const actions = (parsed.toolCalls ?? [])
          .map(tc => tc.function?.name)
          .filter((n): n is string => Boolean(n))
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
        if (TOOL_WRITE_SET.has(action)) dirty.value = true
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
  async function runLlm(prompt: string): Promise<void> {
    busy.value = true
    aiBuffer.value = ''
    const captureState: { files: Record<string, string> | null } = { files: null }
    try {
      const s = ensureSession()
      configureSessionBackend({ getHeaders: createAuthHeaders, onSseEvent })
      pushLog('info', '开始 LLM 编辑', `需求: ${prompt}`)
      const result = await runStillsLoop(prompt, s, backend, {
        maxRounds: 12,
        slidingWindow: 12,
        systemPrompt: STILLS_EDIT_RUNTIME_PROMPT,
        ...(backendSessionId ? { resumeSessionId: backendSessionId } : {}),
        tools: generateToolDefinitions({ compactDescriptions: true }),
        monitors: [createRepeatDetectionMonitor({ maxSameSignature: 2, maxConsecutiveErrors: 2 })],
        onTurnComplete(turn: DialogueTurn) {
          if (turn.toolBlock?.action === 'edit.exportFiles' && turn.stillsResult?.ok) {
            const exportData = turn.stillsResult.data as { files?: Record<string, string> } | null | undefined
            captureState.files = exportData?.files ?? null
          }
          if (turn.toolBlock?.action && turn.stillsResult) {
            const r = turn.stillsResult
            if (r.ok) {
              pushLog('success', `✓ ${turn.toolBlock.action}`, r.summary ?? JSON.stringify(r.data, null, 2).slice(0, 300))
            } else {
              pushLog('error', `✗ ${turn.toolBlock.action}`, r.msg ?? '失败')
            }
          }
        },
      })
      backendSessionId = result.sessionId
      if (result.aborted) throw new Error(`Stills 中止: ${result.abortReason}`)
      const capturedFiles = captureState.files
      if (capturedFiles !== null && Object.keys(capturedFiles).length > 0) {
        onApply(capturedFiles)
        dirty.value = false
        pushLog('success', '✅ 已应用', `文件更新完成 (${result.rounds} 轮): ${Object.keys(capturedFiles).join(', ')}`)
        onStatus(`✅ 细粒度编辑完成 (${result.rounds} 轮)`, 'success')
      } else {
        dirty.value = true
        pushLog('info', `${result.rounds} 轮完成`, '未获取到导出文件，如有变更请点击「导出并应用」')
        onStatus('⚠️ 执行完成但无文件导出', 'warning')
      }
    } catch (err) {
      pushLog('error', '编辑失败', err instanceof Error ? err.message : String(err))
      onStatus(`AI 操作失败: ${err instanceof Error ? err.message : String(err)}`, 'error')
      throw err
    } finally {
      configureSessionBackend({ getHeaders: createAuthHeaders })
      busy.value = false
    }
  }

  /** Export current session state and write back rule.json. */
  function exportAndApply(): void {
    if (!dirty.value || !session.value) return
    busy.value = true
    try {
      const result = executeStill('edit.exportFiles', {}, session.value, 'export')
      if (!result.ok) {
        pushLog('error', 'edit.exportFiles', result.msg)
        return
      }
      const exportData = result.data as { files?: Record<string, string> }
      const files = exportData.files ?? {}
      if (!files['rule.json']) {
        pushLog('error', '导出', 'exportFiles 未返回 rule.json')
        return
      }
      onApply(files)
      dirty.value = false
      pushLog('success', '已应用', `文件已写回编辑器: ${Object.keys(files).join(', ')}`)
    } catch (err) {
      pushLog('error', '异常', err instanceof Error ? err.message : String(err))
    } finally {
      busy.value = false
    }
  }

  /** Reset session (re-bootstrap on next use). */
  function reset() {
    session.value = null
    ready.value = false
    dirty.value = false
    nodeTree.value = null
    log.value = []
    aiBuffer.value = ''
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
    const tree = nodeTree.value
    if (!tree) return
    tree.loadRoot({ type: 'page', children: parsed })
  }

  onUnmounted(() => {
    if (backendSessionId) void backend.destroySession(backendSessionId)
    clearRegistry()
    clearDomains()
  })

  return { ready, dirty, busy, aiBuffer, log, nodeTree, execTool, runLlm, exportAndApply, reset, loadRuleJson }
}
