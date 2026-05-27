/**
 * App service adapter for DevSystem pageDesign AI.
 *
 * Keeps the UI layer away from AI platform tokens and page-config AI registration:
 * UI passes a generic capability consumer and PageEditor, this adapter wires them
 * to the pageDesign business registration and live PageModel edit host.
 */
import type { AiAgentStreamEvent, AiAgentToolCallRecord } from '@spark-view/spark-ai/agent'
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
}

export type PageDesignAiRunResult = {
  sawToolCall: boolean
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

  command.editor.setActivePage(pageId)
  await command.editor.ensureActivePageFilesLoaded({ allowMissingAsEmpty: true })

  const pageDesignHost = ensurePageDesignBusiness({
    host: aiAgentHost,
    getPageDesignEditHost: (context) => command.editor.createPageDesignEditHost({
      pageId: context.moduleInstanceId,
    }),
  })

  let sawToolCall = false
  await pageDesignHost.run(PAGE_DESIGN_MODULE_ID, buildPageDesignRunInput(pageId, command), {
    ...(command.events?.onReasoning === undefined ? {} : { onReasoning: command.events.onReasoning }),
    ...(command.events?.onDelta === undefined ? {} : { onDelta: command.events.onDelta }),
    ...(command.events?.onStreamEvent === undefined ? {} : { onStreamEvent: command.events.onStreamEvent }),
    onToolCall: (record: AiAgentToolCallRecord) => {
      sawToolCall = true
      command.events?.onToolCall?.(record)
    },
  })

  return { sawToolCall }
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
