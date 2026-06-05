/**
 * DevSystem 面板内 pageDesign AI — 使用 APP 门面单例（`getAppProjectEditor()`）。
 *
 * `command.editor` 必须与手动编辑同一 `editor.project`，保存/撤销语义一致。
 * 隔离式 SSE Host Run 见 `page-design-host-run-provider.ts`（headless 临时门面）。
 */
import { createAiRunAdapter, noopTraceSink } from '@spark-appworks/spark-app'
import type {
  AiRunAbortHandler,
  AiRunAdapterState,
  AiRunBeforeFunctionCall,
  AiRunTraceSink,
} from '@spark-appworks/spark-app'
import type { AiAgentStreamEvent, AiAgentToolCallRecord } from '@spark-appworks/spark-ai/agent'
import { AI_AGENT_HOST } from '@spark-appworks/spark-ai/agent'
import type { SparkCapabilityConsumer } from '@spark-appworks/spark-utils'
import type { ProjectEditor } from '@spark-appworks/spark-project-model/project'
import {
  PAGE_DESIGN_MODULE_ID,
  ensurePageDesignBusiness,
  type PageDesignAllowedOperations,
  type PageDesignRunInput,
  type PageDesignRunMode,
} from '@/services/page-design-business'
import { resolvePageDesignEditor } from '@/services/page-design-editor-provider'

export type PageDesignAiRunOptions = {
  description: string
  mode?: PageDesignRunMode
  allowedOperations?: PageDesignAllowedOperations
  preserveExistingInteractions?: boolean
}

/**
 * Legacy non-content callbacks for DevSystem status messages.
 *
 * AI stream content belongs to `trace` / spark-ai. UI callers must not store
 * delta or reasoning fragments through this side channel.
 */
export type PageDesignAiRunEvents = {
  onToolCall?: (record: AiAgentToolCallRecord) => void
  onStreamEvent?: (event: AiAgentStreamEvent) => void
}

export type PageDesignAiRunCommand = PageDesignAiRunOptions & {
  pageId: string
  editor: ProjectEditor
  consumeCapability: SparkCapabilityConsumer | null
  events?: PageDesignAiRunEvents
  trace?: AiRunTraceSink
  adapter?: AiRunAdapterState
  beforeFunctionCall?: AiRunBeforeFunctionCall
  onAbort?: AiRunAbortHandler
  userMessage?: string
}

export type PageDesignAiRunResult = {
  sawToolCall: boolean
}

export async function runPageDesignAiSession(command: PageDesignAiRunCommand): Promise<PageDesignAiRunResult> {
  const pageId = command.pageId.trim()
  const description = command.description.trim()
  if (!pageId) throw new Error('pageDesign AI requires a pageId.')
  if (!description) throw new Error('pageDesign AI requires a description.')

  const aiAgentHost = command.consumeCapability?.(AI_AGENT_HOST) ?? null
  if (aiAgentHost === null) {
    throw new Error('AI Host 未注册，无法启动 pageDesign。')
  }

  assertActivePageNodeLoaded(command.editor, pageId)

  const pageDesignHost = ensurePageDesignBusiness({
    host: aiAgentHost,
    getPageDesignEditor: (context) => {
      if (context.moduleInstanceId !== pageId) {
        throw new Error(`pageDesign editor mismatch: expected "${pageId}", got "${context.moduleInstanceId}".`)
      }
      const singleton = resolvePageDesignEditor(
        { moduleInstanceId: pageId, useAppSingleton: true },
        new Map(),
      )
      if (singleton !== command.editor) {
        throw new Error('pageDesign DevSystem session must use the same ProjectEditor instance as command.editor.')
      }
      return command.editor
    },
  })

  let sawToolCall = false
  const adapter = command.adapter ?? createAiRunAdapter()
  await adapter.run({
    host: pageDesignHost,
    alias: PAGE_DESIGN_MODULE_ID,
    input: buildPageDesignRunInput(pageId, command),
    ...(command.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: command.beforeFunctionCall }),
    ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
    trace: createPageDesignTraceSink({
      trace: command.trace,
      events: command.events,
      onToolCall: (record) => {
        sawToolCall = true
        command.events?.onToolCall?.(record)
      },
    }),
    userMessage: command.userMessage ?? description,
  })

  return { sawToolCall }
}

type CreatePageDesignTraceSinkOptions = Readonly<{
  trace: AiRunTraceSink | undefined
  events: PageDesignAiRunEvents | undefined
  onToolCall(record: AiAgentToolCallRecord): void
}>

function createPageDesignTraceSink(options: CreatePageDesignTraceSinkOptions): AiRunTraceSink {
  const trace = options.trace ?? noopTraceSink

  return {
    appendUserMessage: (content) => trace.appendUserMessage(content),
    appendEvent: (event) => {
      trace.appendEvent(event)
      options.events?.onStreamEvent?.(event)
    },
    appendDelta: (delta) => {
      trace.appendDelta(delta)
    },
    appendReasoning: (reasoning) => {
      trace.appendReasoning(reasoning)
    },
    appendToolCall: (record) => {
      trace.appendToolCall(record)
      options.onToolCall(record)
    },
    appendError: (message) => trace.appendError(message),
    markAborted: (message) => trace.markAborted(message),
    finish: () => trace.finish(),
    reset: () => trace.reset(),
  }
}

function assertActivePageNodeLoaded(editor: ProjectEditor, pageId: string): void {
  const activePage = editor.getActivePage()
  if (activePage === null) {
    throw new Error('pageDesign AI requires the current PageNode to be opened before editing.')
  }
  if (activePage.pageId !== pageId) {
    throw new Error(`pageDesign AI active PageNode mismatch: expected "${pageId}", got "${activePage.pageId}".`)
  }
  if (!activePage.isLoaded) {
    throw new Error(`pageDesign AI requires PageNode "${pageId}" to be loaded before editing.`)
  }
}

function buildPageDesignRunInput(pageId: string, options: PageDesignAiRunOptions): PageDesignRunInput {
  const input: {
    pageId: string
    description: string
    mode?: PageDesignRunMode
    allowedOperations?: PageDesignAllowedOperations
    preserveExistingInteractions?: boolean
  } = {
    pageId,
    description: options.description.trim(),
  }
  if (options.mode !== undefined) input.mode = options.mode
  if (options.allowedOperations !== undefined) input.allowedOperations = options.allowedOperations
  if (options.preserveExistingInteractions !== undefined) {
    input.preserveExistingInteractions = options.preserveExistingInteractions
  }
  return input
}
