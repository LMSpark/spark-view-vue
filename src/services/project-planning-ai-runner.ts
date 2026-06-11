/**
 * @module app:services/project-planning-ai-runner
 * app 的 services/project-planning-ai-runner 模块。
 * 导出 ClassModel symbol: ProjectPlanningAiRunOptions, ProjectPlanningAiRunEvents, ProjectPlanningAiRunCommand, ProjectPlanningAiRunResult（共 4 个 symbol）。
 */
/**
 * projectPlanning headless AI runner（无 DevSystem / 无 UI 依赖）。
 *
 * 统一入口：`runProjectPlanningAiSession` → `AiAgentHost.run('projectPlanning', input)`。
 * DevSystem 或其它壳层只需注入 `ProjectWorkspace` 与可选 `consumeCapability(AI_AGENT_HOST)`。
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
  buildProjectPlanningAgentInput,
  ensureProjectPlanningBusiness,
  PROJECT_PLANNING_MODULE_ID,
  type ProjectPlanningAgentInput,
  type ResolveScopedProjectPlanningRunInputOptions,
} from '@/services/project-planning-business'

/** Project Planning Ai Run Options 的调用配置。 */
export type ProjectPlanningAiRunOptions = ResolveScopedProjectPlanningRunInputOptions & Readonly<{
  /** 自动化/headless 可在 run 结束后保存 navigation；默认 false。 */
  saveNavigationAfterRun?: boolean
}>

/** Project Planning Ai Run Events 的语义模型。 */
export type ProjectPlanningAiRunEvents = Readonly<{
  onToolCall?: (record: AiAgentToolCallRecord) => void
}>

/** Project Planning Ai Run Command 的命令参数。 */
export type ProjectPlanningAiRunCommand = ProjectPlanningAiRunOptions & Readonly<{
  editor: ProjectWorkspace
  consumeCapability?: SparkCapabilityConsumer | null
  /** 测试或编排层可直接注入 Host，跳过 capability 查找。 */
  host?: AiAgentHost
  events?: ProjectPlanningAiRunEvents
  trace?: AiRunTraceSink
  adapter?: AiRunAdapterState
  beforeFunctionCall?: AiRunBeforeFunctionCall
  onAbort?: AiRunAbortHandler
  /** 默认使用 requirement 作为 user turn 文本。 */
  userMessage?: string
}>

/** Project Planning Ai Run Result 的返回结果。 */
export type ProjectPlanningAiRunResult = Readonly<{
  sawToolCall: boolean
  input: ProjectPlanningAgentInput
  navigationDirty: boolean
  savedNavigation: boolean
}>

export async function runProjectPlanningAiSession(
  command: ProjectPlanningAiRunCommand,
): Promise<ProjectPlanningAiRunResult> {
  const editor = command.editor
  const projectId = editor.project.projectId.trim()
  if (projectId.length === 0) {
    throw new Error('projectPlanning AI requires a projectId on editor.project.')
  }

  const aiAgentHost = command.host
    ?? command.consumeCapability?.(AI_AGENT_HOST)
    ?? null
  if (aiAgentHost === null) {
    throw new Error('AI Host 未注册，无法启动 projectPlanning。')
  }

  const input = buildProjectPlanningAgentInput(editor.project, command)
  const projectPlanningHost = ensureProjectPlanningBusiness({
    host: aiAgentHost,
    getProjectPlanningEditor: (context) => {
      if (context.moduleInstanceId !== projectId) {
        throw new Error(
          `projectPlanning editor mismatch: expected "${projectId}", got "${context.moduleInstanceId}".`,
        )
      }
      return editor
    },
  })

  let sawToolCall = false
  const adapter = command.adapter ?? createAiRunAdapter()
  await adapter.run({
    host: projectPlanningHost,
    alias: PROJECT_PLANNING_MODULE_ID,
    input,
    ...(command.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: command.beforeFunctionCall }),
    ...(command.onAbort === undefined ? {} : { onAbort: command.onAbort }),
    trace: createProjectPlanningTraceSink({
      trace: command.trace,
      events: command.events,
      onToolCall: (record) => {
        sawToolCall = true
        command.events?.onToolCall?.(record)
      },
    }),
    userMessage: command.userMessage ?? input.requirement,
  })

  const navigationDirty = editor.project.navigationDirty
  const savedNavigation = command.saveNavigationAfterRun === true && navigationDirty
  if (savedNavigation) {
    await editor.saveAll()
  }

  return {
    sawToolCall,
    input,
    navigationDirty,
    savedNavigation,
  }
}

type CreateProjectPlanningTraceSinkOptions = Readonly<{
  trace: AiRunTraceSink | undefined
  events: ProjectPlanningAiRunEvents | undefined
  onToolCall(record: AiAgentToolCallRecord): void
}>

function createProjectPlanningTraceSink(
  options: CreateProjectPlanningTraceSinkOptions,
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
