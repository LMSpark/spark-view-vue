/**
 * App service adapter for DevSystem pageDesign AI.
 *
 * Keeps the UI layer away from AI platform tokens and page-config AI registration:
 * UI passes a generic capability consumer and PageEditor, this adapter wires them
 * to the pageDesign business registration and live PageModel edit host.
 */
import { createAiRunAdapter, noopTraceSink } from '@spark-view/spark-app'
import type { AiRunAdapterState, AiRunTraceSink } from '@spark-view/spark-app'
import type { AiAgentSessionRecord, AiAgentStreamEvent, AiAgentToolCallRecord } from '@spark-view/spark-ai/agent'
import { AI_AGENT_HOST } from '@spark-view/spark-ai/agent'
import type { SparkCapabilityConsumer } from '@spark-view/spark-utils'
import type { PageEditor } from '@spark-view/spark-page-config/editor'
import {
  PAGE_DESIGN_MODULE_ID,
  ensurePageDesignBusiness,
  type PageDesignAllowedOperations,
  type PageDesignRunInput,
  type PageDesignRunMode,
} from '@spark-view/spark-page-config/ai'

export type PageDesignAiRunOptions = {
  userRequirement: string
  mode?: PageDesignRunMode
  allowedOperations?: PageDesignAllowedOperations
  preserveExistingInteractions?: boolean
}

export type PageDesignAiRunEvents = {
  onReasoning?: (reasoning: string) => void
  onDelta?: (delta: string) => void
  onToolCall?: (record: AiAgentToolCallRecord) => void
  onStreamEvent?: (event: AiAgentStreamEvent) => void
}

export type PageDesignAiRunCommand = PageDesignAiRunOptions & {
  pageId: string
  editor: PageEditor
  consumeCapability: SparkCapabilityConsumer | null
  events?: PageDesignAiRunEvents
  trace?: AiRunTraceSink
  adapter?: AiRunAdapterState
  onSessionRecord?: (record: AiAgentSessionRecord | null) => void
  userMessage?: string
}

export type PageDesignAiRunResult = {
  sawToolCall: boolean
  sessionRecord: AiAgentSessionRecord | null
}

export async function runPageDesignAiSession(command: PageDesignAiRunCommand): Promise<PageDesignAiRunResult> {
  const pageId = command.pageId.trim()
  const userRequirement = command.userRequirement.trim()
  if (!pageId) throw new Error('pageDesign AI requires a pageId.')
  if (!userRequirement) throw new Error('pageDesign AI requires a userRequirement.')

  const aiAgentHost = command.consumeCapability?.(AI_AGENT_HOST) ?? null
  if (aiAgentHost === null) {
    throw new Error('AI Host 未注册，无法启动 pageDesign。')
  }

  assertActivePageModelLoaded(command.editor, pageId)

  const pageDesignHost = ensurePageDesignBusiness({
    host: aiAgentHost,
    getPageDesignEditHost: (context) => command.editor.createPageDesignEditHost({
      pageId: context.moduleInstanceId,
    }),
  })

  let sawToolCall = false
  let sessionRecord: AiAgentSessionRecord | null = null
  const adapter = command.adapter ?? createAiRunAdapter()
  const result = await adapter.run({
    host: pageDesignHost,
    alias: PAGE_DESIGN_MODULE_ID,
    input: buildPageDesignRunInput(pageId, command),
    trace: createPageDesignTraceSink({
      trace: command.trace,
      events: command.events,
      onToolCall: (record) => {
        sawToolCall = true
        command.events?.onToolCall?.(record)
      },
    }),
    userMessage: command.userMessage ?? userRequirement,
    onSessionRecord: (record) => {
      sessionRecord = record
      command.onSessionRecord?.(record)
    },
  })
  if (result !== null) {
    sessionRecord = result.session.getSessionRecord()
  }

  return { sawToolCall, sessionRecord }
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
      options.events?.onDelta?.(delta)
    },
    appendReasoning: (reasoning) => {
      trace.appendReasoning(reasoning)
      options.events?.onReasoning?.(reasoning)
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

function assertActivePageModelLoaded(editor: PageEditor, pageId: string): void {
  const activePage = editor.getActivePage()
  if (activePage === null) {
    throw new Error('pageDesign AI requires the current PageModel to be opened before editing.')
  }
  if (activePage.pageId !== pageId) {
    throw new Error(`pageDesign AI active PageModel mismatch: expected "${pageId}", got "${activePage.pageId}".`)
  }
  if (!activePage.isLoaded) {
    throw new Error(`pageDesign AI requires PageModel "${pageId}" to be loaded before editing.`)
  }
}

function buildPageDesignRunInput(pageId: string, options: PageDesignAiRunOptions): PageDesignRunInput {
  const input: {
    pageId: string
    userRequirement: string
    mode?: PageDesignRunMode
    allowedOperations?: PageDesignAllowedOperations
    preserveExistingInteractions?: boolean
  } = {
    pageId,
    userRequirement: options.userRequirement.trim(),
  }
  if (options.mode !== undefined) input.mode = options.mode
  if (options.allowedOperations !== undefined) input.allowedOperations = options.allowedOperations
  if (options.preserveExistingInteractions !== undefined) {
    input.preserveExistingInteractions = options.preserveExistingInteractions
  }
  return input
}
