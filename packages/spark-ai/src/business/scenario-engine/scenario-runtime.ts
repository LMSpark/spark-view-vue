import { createScenarioRegistry, type AiScenarioRegistry } from './scenario-registry'
import type {
  AiScenarioContext,
  AiScenarioDefinition,
  AiScenarioRunRequest,
  AiScenarioRunResult,
  AiScenarioTool,
  AiScenarioToolExecution,
} from './scenario-types'

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：运行时内部工具
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 解析场景系统提示词。
 * 支持字符串常量或基于上下文的动态函数。
 */
function resolveSystemPrompt(scenario: AiScenarioDefinition, ctx: AiScenarioContext): string {
  return typeof scenario.promptPolicy.systemPrompt === 'function'
    ? scenario.promptPolicy.systemPrompt(ctx)
    : scenario.promptPolicy.systemPrompt
}

/**
 * 将运行请求标准化为运行时上下文。
 */
function toContext(request: AiScenarioRunRequest): AiScenarioContext {
  return {
    userInput: request.userInput,
    ...(request.context ?? {}),
  }
}

/**
 * 根据 buildSteps 结果生成默认工具调用序列。
 * 若场景未定义步骤构建器，则返回空数组。
 */
function buildStepCalls(
  scenario: AiScenarioDefinition,
  payload: unknown,
  ctx: AiScenarioContext,
): ReadonlyArray<{ tool: string; args: unknown }> {
  if (scenario.buildSteps === undefined) return []
  const steps = scenario.buildSteps(payload, ctx)
  return steps.map((step) => ({ tool: step.tool, args: step.args }))
}

/**
 * 把工具数组投影为 Map，便于 O(1) 查找执行器。
 */
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

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：运行时接口
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 场景运行时。
 * - registry：负责场景管理与路由
 * - run：负责单次执行
 */
export interface AiScenarioRuntime {
  registry: AiScenarioRegistry
  run: (request: AiScenarioRunRequest) => Promise<AiScenarioRunResult>
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：运行时实现
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建场景运行时。
 *
 * 时序说明：
 * 1) 入参标准化（toContext）
 * 2) 选择场景（指定 scenarioId 或自动 resolve）
 * 3) 构建 payload / steps / systemPrompt
 * 4) 决策调用序列（外部 toolCalls 优先，否则 buildSteps）
 * 5) 执行工具并累积 executions
 * 6) 输出 planned/completed/failed
 */
export function createScenarioRuntime(initial: readonly AiScenarioDefinition[] = []): AiScenarioRuntime {
  const registry = createScenarioRegistry(initial)

  async function run(request: AiScenarioRunRequest): Promise<AiScenarioRunResult> {
    const ctx = toContext(request)
    const scenario = request.scenarioId !== undefined
      ? registry.get(request.scenarioId)
      : registry.resolve(request.userInput, ctx)?.scenario

    if (scenario === undefined) {
      throw new Error('No scenario matched current input. Please provide scenarioId or register matching intents.')
    }

    const payload = request.payload ?? scenario.buildPayload?.(ctx) ?? {}
    const steps = scenario.buildSteps?.(payload, ctx) ?? []
    const systemPrompt = resolveSystemPrompt(scenario, ctx)

    const toolMap = createToolMap(scenario.tools)
    const calls = request.toolCalls ?? buildStepCalls(scenario, payload, ctx)

    // 仅规划模式：不执行任何工具。
    if (request.dryRun || calls.length === 0) {
      return {
        scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
        systemPrompt,
        payload,
        steps,
        executions: [],
        status: 'planned',
      }
    }

    const executions: AiScenarioToolExecution[] = []
    for (const call of calls) {
      const tool = toolMap.get(call.tool)
      if (tool === undefined) {
        executions.push({
          tool: call.tool,
          args: call.args,
          ok: false,
          error: `Tool not registered in scenario: ${call.tool}`,
        })
        return {
          scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
          systemPrompt,
          payload,
          steps,
          executions,
          status: 'failed',
        }
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
          return {
            scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
            systemPrompt,
            payload,
            steps,
            executions,
            status: 'failed',
          }
        }
        executions.push({
          tool: call.tool,
          args: call.args,
          ok: true,
          result,
        })
      } catch (error) {
        executions.push({
          tool: call.tool,
          args: call.args,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
        return {
          scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
          systemPrompt,
          payload,
          steps,
          executions,
          status: 'failed',
        }
      }
    }

    return {
      scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
      systemPrompt,
      payload,
      steps,
      executions,
      status: 'completed',
    }
  }

  return {
    registry,
    run,
  }
}
