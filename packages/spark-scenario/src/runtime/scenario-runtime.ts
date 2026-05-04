import { createScenarioRegistry, type AiScenarioRegistry } from './scenario-registry'
import { createScenarioRunHistoryStore } from '../history/run-history-store'
import type { ScenarioPromptTemplateRegistry } from '../prompt/scenario-prompt-template-registry'
import type {
  AiScenarioHistoryPage,
  AiScenarioHistoryQuery,
  AiScenarioContext,
  AiScenarioDefinition,
  AiScenarioRunRecord,
  AiScenarioRunRequest,
  AiScenarioRunResult,
  AiScenarioTool,
  AiScenarioToolCall,
  AiScenarioToolExecution,
} from '../contracts/scenario-types'

/**
 * ==============================================
 * 运行时层：场景执行引擎
 * ==============================================
 * 功能分区：
 * 1) 解析 prompt（模板优先 + 静态回退）。
 * 2) 执行主流程工具调用与闭合工具调用。
 * 3) 记录运行历史并提供查询能力。
 *
 * 时序分区：
 * 1) run(request) 入口构建上下文。
 * 2) resolve 场景与 payload。
 * 3) 执行主流程 calls。
 * 4) 根据 completion 策略决定是否自动执行闭合工具。
 * 5) 产出结果并写入 history。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：运行时内部工具
// ═══════════════════════════════════════════════════════════════════════════

function pickExtraConstraints(value: Record<string, unknown> | undefined): readonly string[] {
  if (value === undefined) return []
  const raw = value['extraConstraints']
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string')
}

/** 解析 prompt 模板上下文。 */
function resolvePromptTemplateContext(scenario: AiScenarioDefinition, ctx: AiScenarioContext): Record<string, unknown> | undefined {
  const templateContext = scenario.promptPolicy.promptTemplateContext
  if (templateContext === undefined) return undefined
  return typeof templateContext === 'function'
    ? templateContext(ctx)
    : templateContext
}

/**
 * 提示词解析顺序：
 * 1) promptTemplateId + promptTemplates（优先）
 * 2) promptPolicy.systemPrompt（回退）
 * 3) 两者都无时 fail-fast 抛错
 */
function resolveSystemPrompt(
  scenario: AiScenarioDefinition,
  ctx: AiScenarioContext,
  promptTemplates?: ScenarioPromptTemplateRegistry,
): string {
  const templateId = scenario.promptPolicy.promptTemplateId
  if (templateId !== undefined && templateId.trim() !== '' && promptTemplates !== undefined) {
    const templateCtx = resolvePromptTemplateContext(scenario, ctx)
    const prompt = promptTemplates.buildPrompt(templateId, {
      extraConstraints: pickExtraConstraints(templateCtx),
    })
    if (prompt !== undefined && prompt.trim() !== '') {
      return prompt
    }
  }

  const staticPrompt = scenario.promptPolicy.systemPrompt
  if (staticPrompt !== undefined) {
    return typeof staticPrompt === 'function'
      ? staticPrompt(ctx)
      : staticPrompt
  }

  throw new Error(`Scenario ${scenario.id} has no resolvable system prompt.`)
}

/** 把 run request 规范化为上下文对象。 */
function toContext(request: AiScenarioRunRequest): AiScenarioContext {
  return {
    userInput: request.userInput,
    ...(request.context ?? {}),
  }
}

/** 由场景 buildSteps 生成默认调用序列。 */
function buildStepCalls(
  scenario: AiScenarioDefinition,
  payload: unknown,
  ctx: AiScenarioContext,
): ReadonlyArray<{ tool: string; args: unknown }> {
  if (scenario.buildSteps === undefined) return []
  const steps = scenario.buildSteps(payload, ctx)
  return steps.map((step) => ({ tool: step.tool, args: step.args }))
}

/** 工具数组转 Map，降低查找复杂度。 */
function createToolMap(tools: readonly AiScenarioTool[]): Map<string, AiScenarioTool> {
  const map = new Map<string, AiScenarioTool>()
  for (const tool of tools) {
    map.set(tool.name, tool)
  }
  return map
}

function isFailedToolResult(value: unknown): value is { ok: false; code?: string; msg?: string; fix?: string } {
  return (
    typeof value === 'object'
    && value !== null
    && 'ok' in value
    && (value as { ok?: unknown }).ok === false
  )
}

function formatFailedToolResult(result: { code?: string; msg?: string; fix?: string }): string {
  const code = result.code !== undefined && result.code !== '' ? `[${result.code}] ` : ''
  const message = result.msg ?? 'Tool returned ok=false'
  return result.fix !== undefined && result.fix !== ''
    ? `${code}${message}; fix: ${result.fix}`
    : `${code}${message}`
}

/** 判断是否自动执行 completion 工具。 */
function shouldAutoRunCompletion(scenario: AiScenarioDefinition, defaultMode: 'auto' | 'manual'): boolean {
  const mode = scenario.completion?.mode ?? defaultMode
  return mode === 'auto'
}

/** 生成闭合阶段调用计划。 */
function buildCompletionCalls(
  scenario: AiScenarioDefinition,
  payload: unknown,
  executedTools: ReadonlySet<string>,
  defaultMode: 'auto' | 'manual',
): AiScenarioToolCall[] {
  if (!shouldAutoRunCompletion(scenario, defaultMode)) return []
  const completionTools = scenario.completion?.tools ?? []
  if (completionTools.length === 0) return []

  const calls: AiScenarioToolCall[] = []
  for (const toolName of completionTools) {
    if (executedTools.has(toolName)) continue
    calls.push({ tool: toolName, args: payload })
  }
  return calls
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：运行时接口
// ═══════════════════════════════════════════════════════════════════════════

export interface AiScenarioRuntime {
  registry: AiScenarioRegistry
  /** 主执行入口：一次请求对应一次 runId。 */
  run: (request: AiScenarioRunRequest) => Promise<AiScenarioRunResult>
  /** 按 runId 查询单次执行记录。 */
  getRunRecord: (runId: string) => AiScenarioRunRecord | undefined
  /** 分页查询执行历史。 */
  queryHistory: (query?: AiScenarioHistoryQuery) => AiScenarioHistoryPage
  /** 清空执行历史。 */
  clearHistory: () => void
}

export interface AiScenarioRuntimeOptions {
  /** 提示词模板注册中心（可选）。 */
  promptTemplates?: ScenarioPromptTemplateRegistry
  /** 历史最大保留条数。 */
  historyLimit?: number
  /** 默认闭合模式。 */
  completionMode?: 'auto' | 'manual'
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：运行时实现
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建场景运行时（Runtime）。
 *
 * 功能：负责将 AiScenarioRunRequest 转换为执行上下文、按步骤执行工具、处理闭合策略并写入历史。
 *
 * 典型使用流程：
 * 1) runtime.registry.queryIntentCatalog()/queryScenarioInfo() 等用于规划阶段被 planner 使用；
 * 2) planner 或调用方生成 AiScenarioRunRequest 后调用 runtime.run(request) 执行；
 * 3) runtime 在执行结束后将记录写入内部 historyStore（可通过 options.historyLimit 配置保留条数）。
 */
export function createScenarioRuntime(
  initial: readonly AiScenarioDefinition[] = [],
  options: AiScenarioRuntimeOptions = {},
): AiScenarioRuntime {
  // 阶段 0：初始化依赖（history -> registry -> options）
  const historyStore = createScenarioRunHistoryStore(options.historyLimit)
  const registry = createScenarioRegistry(initial, {
    queryRunHistory: (query) => historyStore.query(query),
    queryRunRecord: (runId) => historyStore.get(runId),
  })
  const promptTemplates = options.promptTemplates
  const completionMode = options.completionMode ?? 'auto'
  let runCounter = 0

  function getRunRecord(runId: string): AiScenarioRunRecord | undefined {
    return historyStore.get(runId)
  }

  function queryHistory(query?: AiScenarioHistoryQuery): AiScenarioHistoryPage {
    return historyStore.query(query)
  }

  function clearHistory(): void {
    historyStore.clear()
  }

  async function run(request: AiScenarioRunRequest): Promise<AiScenarioRunResult> {
    // 阶段 1：生成运行上下文与 runId
    const runId = `run-${Date.now()}-${++runCounter}`
    const startedAtMs = Date.now()

    const ctx = toContext(request)
    const scenario = request.scenarioId !== undefined
      ? registry.get(request.scenarioId)
      : registry.resolve(request.userInput, ctx)?.scenario

    if (scenario === undefined) {
      throw new Error('No scenario matched current input. Please provide scenarioId or register matching intents.')
    }
    const resolvedScenario = scenario

    // 阶段 2：准备执行前上下文（payload/steps/prompt/toolMap/calls）
    const payload = request.payload ?? resolvedScenario.buildPayload?.(ctx) ?? {}
    const steps = resolvedScenario.buildSteps?.(payload, ctx) ?? []
    const systemPrompt = resolveSystemPrompt(resolvedScenario, ctx, promptTemplates)
    const toolMap = createToolMap(resolvedScenario.tools)
    const calls = request.toolCalls ?? buildStepCalls(resolvedScenario, payload, ctx)

    function buildResult(status: AiScenarioRunResult['status'], executions: readonly AiScenarioToolExecution[]): AiScenarioRunResult {
      return {
        runId,
        scenario: { id: resolvedScenario.id, title: resolvedScenario.title, scope: resolvedScenario.scope },
        systemPrompt,
        payload,
        steps,
        executions,
        status,
      }
    }

    async function executeCall(call: AiScenarioToolCall, executions: AiScenarioToolExecution[]): Promise<boolean> {
      const tool = toolMap.get(call.tool)
      if (tool === undefined) {
        executions.push({
          tool: call.tool,
          args: call.args,
          ok: false,
          error: `Tool not registered in scenario: ${call.tool}`,
        })
        return false
      }

      // 若工具未提供 execute 实现，视为运行时错误并返回失败。
      if (typeof tool.execute !== 'function') {
        executions.push({
          tool: call.tool,
          args: call.args,
          ok: false,
          error: `Tool ${call.tool} has no execute implementation`,
        })
        return false
      }

      try {
        const result = await tool.execute(call.args, ctx)
        if (isFailedToolResult(result)) {
          executions.push({
            tool: call.tool,
            args: call.args,
            ok: false,
            result,
            error: formatFailedToolResult(result),
          })
          return false
        }

        executions.push({
          tool: call.tool,
          args: call.args,
          ok: true,
          result,
        })
        return true
      } catch (error) {
        executions.push({
          tool: call.tool,
          args: call.args,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
        return false
      }
    }

    if (request.dryRun || calls.length === 0) {
      // 阶段 3A：仅规划模式，不执行业务工具
      const result = buildResult('planned', [])
      historyStore.push(request, result, startedAtMs)
      return result
    }

    // 阶段 3B：执行主流程工具
    const executions: AiScenarioToolExecution[] = []
    const executedTools = new Set<string>()
    for (const call of calls) {
      const ok = await executeCall(call, executions)
      if (!ok) {
        const result = buildResult('failed', executions)
        historyStore.push(request, result, startedAtMs)
        return result
      }
      executedTools.add(call.tool)
    }

    const completionCalls = buildCompletionCalls(resolvedScenario, payload, executedTools, completionMode)
    // 阶段 4：执行闭合工具（按策略自动触发）
    for (const completionCall of completionCalls) {
      const ok = await executeCall(completionCall, executions)
      if (!ok) {
        const result = buildResult('failed', executions)
        historyStore.push(request, result, startedAtMs)
        return result
      }
      executedTools.add(completionCall.tool)
    }

    // 阶段 5：返回完成态并写入历史
    const result = buildResult('completed', executions)
    historyStore.push(request, result, startedAtMs)
    return result
  }

  return {
    registry,
    run,
    getRunRecord,
    queryHistory,
    clearHistory,
  }
}
