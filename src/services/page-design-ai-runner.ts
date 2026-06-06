/**
 * DevSystem 面板内 pageDesign AI — 使用 DevSystem 当前 ProjectWorkspace。
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
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  PAGE_DESIGN_MODULE_ID,
  ensurePageDesignBusiness,
  resolvePageDesignPlanningContext,
  type PageDesignAllowedOperations,
  type PageDesignRunInput,
  type PageDesignRunMode,
} from '@/services/page-design-business'

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
  editor: ProjectWorkspace
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

  const planning = resolvePageDesignPlanningContext(command.editor.project, pageId)

  const pageDesignHost = ensurePageDesignBusiness({
    host: aiAgentHost,
    getPageDesignEditor: (context) => {
      if (context.moduleInstanceId !== pageId) {
        throw new Error(`pageDesign editor mismatch: expected "${pageId}", got "${context.moduleInstanceId}".`)
      }
      return command.editor
    },
  })

  let sawToolCall = false
  const adapter = command.adapter ?? createAiRunAdapter()
  await adapter.run({
    host: pageDesignHost,
    alias: PAGE_DESIGN_MODULE_ID,
    input: buildPageDesignRunInput(pageId, command, planning),
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

function assertActivePageNodeLoaded(editor: ProjectWorkspace, pageId: string): void {
  const activePage = editor.project.getActivePage()
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

function buildPageDesignRunInput(
  pageId: string,
  options: PageDesignAiRunOptions,
  planning: Pick<PageDesignRunInput, 'effectiveDescription' | 'planningTitle' | 'planningPath'>,
): PageDesignRunInput {
  const input: PageDesignRunInput = {
    pageId,
    description: options.description.trim(),
    effectiveDescription: planning.effectiveDescription,
  }
  if (planning.planningTitle !== undefined) input.planningTitle = planning.planningTitle
  if (planning.planningPath !== undefined) input.planningPath = planning.planningPath
  if (options.mode !== undefined) input.mode = options.mode
  if (options.allowedOperations !== undefined) input.allowedOperations = options.allowedOperations
  if (options.preserveExistingInteractions !== undefined) {
    input.preserveExistingInteractions = options.preserveExistingInteractions
  }
  return input
}