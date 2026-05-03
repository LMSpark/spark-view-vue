import { TIERED_QUERY_CONSTRAINT } from '../prompt/prompt-constraints'
import type { AiScenarioRuntime } from '../runtime/scenario-runtime'
import type { AiScenarioInfo } from '../contracts/query-protocol'
import type { AiScenarioRunRequest } from '../contracts/scenario-types'
import type {
  AiBrowserLlmClient,
  AiBrowserLlmGenerateRequest,
  AiScenarioBrowserPlanner,
  AiScenarioPlan,
  AiScenarioPlanningRequest,
} from '../contracts/llm-contracts'

// ==============================================
// LLM 层：浏览器场景规划器
// ==============================================
// 功能分区：
// 1) 阶段一：基于意图目录选择 scenarioId。
// 2) 阶段二：基于场景工具与 schema 生成 toolCalls。
// 3) 把计划转为 runtime 可执行请求。
//
// 时序分区：
// 1) plan(request) 只生成计划，不执行。
// 2) runWithPlanning(request) 先 plan 再 runtime.run。

interface ScenarioSelectionResult {
  scenarioId: string
  reason?: string
}

interface ToolCallDraft {
  tool: string
  args?: unknown
}

interface ToolCallPlanningResult {
  toolCalls: ToolCallDraft[]
  reason?: string
}

export interface BrowserScenarioPlannerOptions {
  runtime: AiScenarioRuntime
  llm: AiBrowserLlmClient
  temperature?: number
  maxTokens?: number
  maxToolCalls?: number
}

function extractJsonBlock(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed

  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1] !== undefined) return fenced[1].trim()

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return trimmed
}

function parseUnknownObject(text: string): Record<string, unknown> {
  const jsonText = extractJsonBlock(text)
  const value = JSON.parse(jsonText) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('LLM response JSON must be an object.')
  }
  return value as Record<string, unknown>
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key]
  return typeof value === 'string' ? value : undefined
}

function readToolCalls(obj: Record<string, unknown>): ToolCallDraft[] {
  const value = obj['toolCalls']
  if (!Array.isArray(value)) return []
  const result: ToolCallDraft[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const tool = readString(item as Record<string, unknown>, 'tool')
    if (tool === undefined || tool.trim() === '') continue
    const args = (item as Record<string, unknown>)['args']
    result.push({ tool, ...(args !== undefined ? { args } : {}) })
  }
  return result
}

function createLlmRequest(options: BrowserScenarioPlannerOptions, messages: AiBrowserLlmGenerateRequest['messages']): AiBrowserLlmGenerateRequest {
  return {
    messages,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
  }
}

function formatIntentCatalog(runtime: AiScenarioRuntime): string {
  const catalog = runtime.registry.queryIntentCatalog()
  if (catalog.entries.length === 0) return '无可用场景。'
  return catalog.entries
    .map((item) => `- ${item.scenarioId} | ${item.scope} | ${item.title} | intents=${item.intents.join(',')}`)
    .join('\n')
}

function formatScenarioInfo(info: AiScenarioInfo): string {
  const tools = info.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')
  return [
    `scenarioId=${info.scenarioId}`,
    `title=${info.title}`,
    `scope=${info.scope}`,
    `tools:`,
    tools,
  ].join('\n')
}

async function selectScenarioId(options: BrowserScenarioPlannerOptions, request: AiScenarioPlanningRequest): Promise<ScenarioSelectionResult> {
  if (request.forceScenarioId !== undefined && request.forceScenarioId.trim() !== '') {
    return { scenarioId: request.forceScenarioId }
  }

  const messages = [
    {
      role: 'system' as const,
      content: [
        '你是场景路由器。',
        '必须只返回 JSON：{"scenarioId":"...","reason":"..."}',
        '只能从给定目录选择 scenarioId，不允许编造。',
        TIERED_QUERY_CONSTRAINT,
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `用户输入：${request.userInput}`,
        '场景目录：',
        formatIntentCatalog(options.runtime),
      ].join('\n'),
    },
  ]

  const response = await options.llm.generate(createLlmRequest(options, messages))
  const parsed = parseUnknownObject(response.text)
  const scenarioId = readString(parsed, 'scenarioId')
  if (scenarioId === undefined || scenarioId.trim() === '') {
    throw new Error('LLM did not return scenarioId.')
  }
  const reason = readString(parsed, 'reason')
  return {
    scenarioId,
    ...(reason !== undefined ? { reason } : {}),
  }
}

async function planToolCalls(
  options: BrowserScenarioPlannerOptions,
  request: AiScenarioPlanningRequest,
  scenarioId: string,
): Promise<ToolCallPlanningResult> {
  const info = options.runtime.registry.queryScenarioInfo(scenarioId)
  if (info === undefined) {
    throw new Error(`Scenario not found: ${scenarioId}`)
  }

  const toolSchemaHints = info.tools
    .map((tool) => options.runtime.registry.queryToolSchema(tool.name, scenarioId))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .map((item) => `${item.toolName}: ${JSON.stringify(item.parameters ?? {})}`)
    .join('\n')

  const messages = [
    {
      role: 'system' as const,
      content: [
        '你是工具调用规划器。',
        '必须只返回 JSON：{"toolCalls":[{"tool":"...","args":{}}],"reason":"..."}',
        'tool 必须来自给定场景工具列表。',
        '参数必须尽量符合 schema。',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `用户输入：${request.userInput}`,
        '场景信息：',
        formatScenarioInfo(info),
        '参数 schema 提示：',
        toolSchemaHints,
      ].join('\n'),
    },
  ]

  const response = await options.llm.generate(createLlmRequest(options, messages))
  const parsed = parseUnknownObject(response.text)
  const toolCalls = readToolCalls(parsed)
  const maxToolCalls = options.maxToolCalls ?? 8

  const allowedTools = new Set(info.tools.map((tool) => tool.name))
  const filtered = toolCalls.filter((item) => allowedTools.has(item.tool)).slice(0, maxToolCalls)

  const reason = readString(parsed, 'reason')
  return {
    toolCalls: filtered,
    ...(reason !== undefined ? { reason } : {}),
  }
}

function toRunRequest(request: AiScenarioPlanningRequest, plan: AiScenarioPlan): AiScenarioRunRequest {
  const toolCalls = plan.toolCalls ?? []
  return {
    scenarioId: plan.scenarioId,
    userInput: request.userInput,
    ...(request.context !== undefined ? { context: request.context } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(plan.dryRun !== undefined ? { dryRun: plan.dryRun } : {}),
  }
}

export function createBrowserScenarioPlanner(options: BrowserScenarioPlannerOptions): AiScenarioBrowserPlanner {
  async function plan(request: AiScenarioPlanningRequest): Promise<AiScenarioPlan> {
    const selected = await selectScenarioId(options, request)
    const toolPlan = await planToolCalls(options, request, selected.scenarioId)

    return {
      scenarioId: selected.scenarioId,
      toolCalls: toolPlan.toolCalls,
      ...(toolPlan.reason !== undefined ? { reason: toolPlan.reason } : {}),
      ...(request.dryRun !== undefined ? { dryRun: request.dryRun } : {}),
    }
  }

  async function runWithPlanning(request: AiScenarioPlanningRequest) {
    const planResult = await plan(request)
    return options.runtime.run(toRunRequest(request, planResult))
  }

  return {
    plan,
    runWithPlanning,
  }
}
