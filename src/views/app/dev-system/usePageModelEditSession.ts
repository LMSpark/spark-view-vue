/**
 * usePageModelEditSession
 *
 * Tool layer for page-model function-based editing.
 * Owns: function runtime lifecycle, bootstrap, function execution, LLM loop, SSE events, export.
 * Does NOT own: UI state (mode, requestText), emit calls (passed as callbacks).
 *
 * LLM-driven edits go through this composable.
 */

import { onUnmounted, ref, shallowRef } from 'vue'
import type { DialogueTurn, EditToolHost, RepeatDetectionConfig } from '@spark-view/spark-ai'
import {
  createPageModelEditSession,
  type PageModelEditLogEntry,
  type PageModelEditSessionRuntime,
} from '@spark-view/spark-ai'
import type { SparkNodeTree } from '@spark-view/spark-component'
import type { PageModelSessionHost } from './usePageModelSessionHost'

// ── Log entry type ─────────────────────────────────────────────────────────────

export type LogEntry = PageModelEditLogEntry

// ── Composable ────────────────────────────────────────────────────────────────

export interface PageModelEditSessionOptions {
  /** Returns the current page-scoped session key, usually pageId. */
  getSessionKey: () => string
  /** Returns the single live tool host shared with manual editing. */
  getEditToolHost: () => EditToolHost
  /** Optional shared page-model session host. */
  sessionHost?: PageModelSessionHost
  /** Ensures page context files are loaded before first bootstrap. */
  ensureContextLoaded?: () => Promise<void>
  /** Optional runtime override for tests or host-level orchestration. */
  runtime?: Partial<PageModelEditSessionRuntime>
}

export interface PageModelEditRunHooks {
  onDelta?: (delta: string) => void
  onReasoning?: (reasoning: string) => void
  onSseEvent?: (event: { sessionId: string; type: string; data: string }) => void
  /**
  * 每完成一个 function-execute turn 回调；供 sender 转发为 AiPanelStore 事件。
   * 仅在 runLlm 主路径产生的 turn 才会触发。
   */
  onToolTurn?: (turn: DialogueTurn) => void
  /** runLlm 成功结束后触发；纯对话或只读工具轮次的 writeCount 为 0。 */
  onRunComplete?: (payload: { rounds: number; writeCount: number }) => void
  signal?: AbortSignal
}

interface PageModelEditRunOptions extends PageModelEditRunHooks {
  /** 原始人工输入；用于诊断日志，不包含系统拼接的上下文 prompt。 */
  originalUserInput?: string
  /**
   * 已由外层完成 bootstrap 时可置 true，避免重复加载上下文。
   * 默认 false。
   */
  skipBootstrap?: boolean
  maxRounds?: number
  toolMode?: 'all' | 'describe-only'
  repeatDetection?: RepeatDetectionConfig
}

interface PageModelEditBootstrapOptions {
  silent?: boolean
  skipContextLoad?: boolean
}

export function usePageModelEditSession(options: PageModelEditSessionOptions) {
  const controller = createPageModelEditSession({
    getSessionKey: options.getSessionKey,
    getEditToolHost: options.getEditToolHost,
    ...(options.sessionHost ? { sessionHost: options.sessionHost } : {}),
    ...(options.ensureContextLoaded ? { ensureContextLoaded: options.ensureContextLoaded } : {}),
    ...(options.runtime ? { runtime: options.runtime } : {}),
  })

  const initialState = controller.getState()
  const ready = ref(initialState.ready)
  const dirty = ref(initialState.dirty)
  const busy = ref(initialState.busy)
  const aiBuffer = ref(initialState.aiBuffer)
  const log = ref<LogEntry[]>(initialState.log)
  const nodeTree = shallowRef<SparkNodeTree | null>(initialState.nodeTree)

  const unsubscribe = controller.subscribe((state) => {
    ready.value = state.ready
    dirty.value = state.dirty
    busy.value = state.busy
    aiBuffer.value = state.aiBuffer
    log.value = state.log
    nodeTree.value = state.nodeTree
  })

  onUnmounted(() => {
    unsubscribe()
    controller.dispose()
  })

  return {
    ready,
    dirty,
    busy,
    aiBuffer,
    log,
    nodeTree,
    bootstrap: (bootstrapOptions?: PageModelEditBootstrapOptions) => controller.bootstrap(bootstrapOptions),
    runLlm: (prompt: string, hooks?: PageModelEditRunOptions) => controller.runLlm(prompt, hooks),
    clearLog: () => controller.clearLog(),
    reset: () => controller.reset(),
  }
}
