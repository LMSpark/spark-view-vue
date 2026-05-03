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

function resolveSystemPrompt(scenario: AiScenarioDefinition, ctx: AiScenarioContext): string {
  return typeof scenario.promptPolicy.systemPrompt === 'function'
    ? scenario.promptPolicy.systemPrompt(ctx)
    : scenario.promptPolicy.systemPrompt
}

function toContext(request: AiScenarioRunRequest): AiScenarioContext {
  return {
    userInput: request.userInput,
    ...(request.context ?? {}),
  }
}

function buildStepCalls(
  scenario: AiScenarioDefinition,
  payload: unknown,
  ctx: AiScenarioContext,
): ReadonlyArray<{ tool: string; args: unknown }> {
  if (scenario.buildSteps === undefined) return []
  const steps = scenario.buildSteps(payload, ctx)
  return steps.map((step) => ({ tool: step.tool, args: step.args }))
}

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

export interface AiScenarioRuntime {
  registry: AiScenarioRegistry
  run: (request: AiScenarioRunRequest) => Promise<AiScenarioRunResult>
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：运行时实现
// ═══════════════════════════════════════════════════════════════════════════

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
        executions.push({ tool: call.tool, args: call.args, ok: false, error: `Tool not registered in scenario: ${call.tool}` })
        return {
          scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
          systemPrompt, payload, steps, executions, status: 'failed',
        }
      }

      try {
        const result = await tool.execute(call.args, ctx)
        if (isFailedToolResult(result)) {
          executions.push({ tool: call.tool, args: call.args, ok: false, result, error: formatFailedToolResult(result) })
          return {
            scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
            systemPrompt, payload, steps, executions, status: 'failed',
          }
        }
        executions.push({ tool: call.tool, args: call.args, ok: true, result })
      } catch (error) {
        executions.push({ tool: call.tool, args: call.args, ok: false, error: error instanceof Error ? error.message : String(error) })
        return {
          scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
          systemPrompt, payload, steps, executions, status: 'failed',
        }
      }
    }

    return {
      scenario: { id: scenario.id, title: scenario.title, scope: scenario.scope },
      systemPrompt, payload, steps, executions, status: 'completed',
    }
  }

  return { registry, run }
}
