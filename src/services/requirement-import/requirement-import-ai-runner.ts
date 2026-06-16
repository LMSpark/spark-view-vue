/**
 * @module app:services/requirement-import-ai-runner
 * 职责：提供应用层 requirementImport 的 requirement-import-ai-runner 能力，围绕需求文档解析、AI Agent 调用与导航落盘编排。
 * 边界：只停留在需求导入阶段（导航树 + 页面概要），不生成页面 rule/pagedata/script/template，也不越界进入 pageDesign。
 * AI用途：导入需求文档或排查需求导入 Agent 时，用本模块理解 services/requirement-import-ai-runner。
 */
/**
 * requirementImport AI runner — headless 与 Host Run 共用。
 *
 * 统一入口：`runRequirementImportAiSession` → `AiAgentHost.run('requirementImport', input)`。
 * 调用方注入 `ProjectWorkspace`（DevSystem 对话框）；隔离式 SSE Host Run 见 `requirement-import-host-run-provider.ts`。
 */
import { createAiRunAdapter, noopTraceSink } from '@spark-appworks/spark-app'
import type {
  AiRunAbortHandler,
  AiRunAdapterState,
  AiRunBeforeFunctionCall,
  AiRunTraceSink,
} from '@spark-appworks/spark-app'
import type { AiAgentHost, AiAgentToolCallRecord } from '@spark-appworks/spark-ai/agent'
import { AI_AGENT_HOST } from '@spark-appworks/spark-ai/agent'
import type { SparkCapabilityConsumer } from '@spark-appworks/spark-utils'
import type { ProjectWorkspace } from '@spark-appworks/spark-project-model'
import {
  buildRequirementImportAgentInput,
  ensureRequirementImportBusiness,
  REQUIREMENT_IMPORT_MODULE_ID,
  type RequirementImportAgentInput,
} from '@/services/requirement-import/requirement-import-business'
import { createAiDeliveryFailureError } from '@/services/ai/ai-delivery-port'
import { createRequirementImportInlineDeliveryPort } from '@/services/requirement-import/requirement-import-host-run-provider'

/** Requirement Import Ai Run Options 的调用配置。 */
export type RequirementImportAiRunOptions = Readonly<{
  /** 需求文档正文（由 docx-parser 从 .docx 提取）。 */
  documentText: string
  /** 项目名称（可选，用于 system prompt 上下文）。 */
  projectName?: string
  /** 自动化/headless 可在 run 结束后保存 navigation；默认 false。 */
  saveNavigationAfterRun?: boolean
}>

/** Requirement Import Ai Run Events 的语义模型。 */
export type RequirementImportAiRunEvents = Readonly<{
  /** tool call 发生时的回调。 */
  onToolCall?: (record: AiAgentToolCallRecord) => void
}>

/** Requirement Import Ai Run Command 的命令参数。 */
export type RequirementImportAiRunCommand = RequirementImportAiRunOptions & Readonly<{
  /** 项目工作区编辑器实例。 */
  editor: ProjectWorkspace
  /** Spark capability 消费者（用于查找 AI Agent Host）。 */
  consumeCapability?: SparkCapabilityConsumer | null
  /** 测试或编排层可直接注入 Host，跳过 capability 查找。 */
  host?: AiAgentHost
  /** 运行期事件回调集合。 */
  events?: RequirementImportAiRunEvents
  /** trace 输出 sink。 */
  trace?: AiRunTraceSink
  /** AI run 适配器状态（跨轮次复用）。 */
  adapter?: AiRunAdapterState
  /** tool call 前置拦截钩子。 */
  beforeFunctionCall?: AiRunBeforeFunctionCall
  /** 运行被中止时的回调。 */
  onAbort?: AiRunAbortHandler
}>

/** Requirement Import Ai Run Result 的返回结果。 */
export type RequirementImportAiRunResult = Readonly<{
  /** 本次运行是否观察到至少一次 tool call。 */
  sawToolCall: boolean
  /** 注入 Agent 的完整输入契约。 */
  input: RequirementImportAgentInput
  /** 运行结束后导航树是否有未保存变更。 */
  navigationDirty: boolean
  /** 是否已成功保存导航变更。 */
  savedNavigation: boolean
}>

export async function runRequirementImportAiSession(
  command: RequirementImportAiRunCommand,
): Promise<RequirementImportAiRunResult> {
  const editor = command.editor
  const projectId = editor.project.projectId.trim()
  if (projectId.length === 0) {
    throw new Error('requirementImport AI requires a projectId on editor.project.')
  }

  const aiAgentHost = command.host
    ?? command.consumeCapability?.(AI_AGENT_HOST)
    ?? null
  if (aiAgentHost === null) {
    throw new Error('AI Host 未注册，无法启动 requirementImport。')
  }

  const input = buildRequirementImportAgentInput(projectId, command.documentText,
    command.projectName === undefined ? {} : { projectName: command.projectName },
  )
  const requirementImportHost = ensureRequirementImportBusiness({
    host: aiAgentHost,
    getRequirementImportEditor: (context) => {
      if (context.moduleInstanceId !== projectId) {
        throw new Error(
          `requirementImport editor mismatch: expected "${projectId}", got "${context.moduleInstanceId}".`,
        )
      }
      return editor
    },
  })

  let sawToolCall = false
  const adapter = command.adapter ?? createAiRunAdapter()
  await adapter.run({
    host: requirementImportHost,
    alias: REQUIREMENT_IMPORT_MODULE_ID,
    input,
    ...(command.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: command.beforeFunctionCall }),
    ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
    trace: createRequirementImportTraceSink({
      trace: command.trace,
      events: command.events,
      onToolCall: (record) => {
        sawToolCall = true
        command.events?.onToolCall?.(record)
      },
    }),
    userMessage: command.documentText,
  })

  const navigationDirty = editor.project.navigationDirty
  const delivery = createRequirementImportInlineDeliveryPort()
  const deliveryContext = {
    editor,
    saveNavigationAfterRun: command.saveNavigationAfterRun === true,
  }
  const deliveryResult = await delivery.save(deliveryContext)
  await delivery.trace(deliveryContext, deliveryResult)
  if (deliveryResult.status === 'failed') {
    throw createAiDeliveryFailureError(
      deliveryResult.message ?? 'requirementImport delivery failed.',
      deliveryResult,
    )
  }

  return {
    sawToolCall,
    input,
    navigationDirty,
    savedNavigation: deliveryResult.status === 'saved',
  }
}

type CreateRequirementImportTraceSinkOptions = Readonly<{
  trace: AiRunTraceSink | undefined
  events: RequirementImportAiRunEvents | undefined
  onToolCall(record: AiAgentToolCallRecord): void
}>

function createRequirementImportTraceSink(
  options: CreateRequirementImportTraceSinkOptions,
): AiRunTraceSink {
  const trace = options.trace ?? noopTraceSink
  return {
    appendUserMessage: (content) => trace.appendUserMessage(content),
    appendEvent: (event) => trace.appendEvent(event),
    appendDelta: (delta) => trace.appendDelta(delta),
    appendReasoning: (reasoning) => trace.appendReasoning(reasoning),
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
