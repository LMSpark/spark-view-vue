import { describe, expect, it, vi } from 'vitest'
import {
  createScenarioPromptTemplateRegistry,
  createScenarioRuntime,
  type AiScenarioDefinition,
  type AiScenarioTool,
} from '../index'

/**
 * ==============================================
 * 回归测试：spark-scenario runtime
 * ==============================================
 * 功能分区：
 * 1) 验证 completion auto/manual 行为。
 * 2) 验证 prompt template 不可用时的 systemPrompt 回退。
 * 3) 验证历史查询过滤、分页与 registry 代理查询。
 *
 * 时序分区：
 * 1) 准备场景与工具桩。
 * 2) 执行 runtime.run。
 * 3) 校验 status/executions/history。
 */

/**
 * 工具构造器：减少样板代码，聚焦测试行为断言。
 */
function createTool(
  name: string,
  execute: (args: unknown) => unknown,
): AiScenarioTool {
  return {
    name,
    description: name,
    execute: (args) => execute(args),
  }
}

describe('spark-scenario runtime regressions', () => {
  /**
   * 用例 1：闭合工具执行策略。
   * - auto 场景：应自动追加 completion 工具执行
   * - manual 场景：即使 runtime 默认 auto，也不应自动执行 completion
   */
  it('runs completion tools automatically in auto mode and skips in manual mode', async () => {
    // 阶段 1：准备 auto 场景
    const mainAuto = vi.fn((args: unknown) => ({ ok: true, args }))
    const completionAuto = vi.fn((args: unknown) => ({ ok: true, checked: args }))

    const autoScenario: AiScenarioDefinition = {
      id: 'scenario.auto',
      title: 'Auto Completion',
      scope: 'business',
      intents: ['auto'],
      promptPolicy: { systemPrompt: 'auto prompt' },
      completion: {
        mode: 'auto',
        tools: ['completion.check'],
      },
      tools: [
        createTool('main.run', mainAuto),
        createTool('completion.check', completionAuto),
      ],
    }

    const runtimeAuto = createScenarioRuntime([autoScenario], { completionMode: 'auto' })

    // 阶段 2：执行 auto 场景
    const autoResult = await runtimeAuto.run({
      scenarioId: 'scenario.auto',
      userInput: 'run auto',
      toolCalls: [{ tool: 'main.run', args: { value: 1 } }],
    })

    // 阶段 3：断言 auto completion 已执行
    expect(autoResult.status).toBe('completed')
    expect(autoResult.executions.map((item) => item.tool)).toEqual(['main.run', 'completion.check'])
    expect(mainAuto).toHaveBeenCalledTimes(1)
    expect(completionAuto).toHaveBeenCalledTimes(1)

    // 阶段 4：准备 manual 场景
    const mainManual = vi.fn((args: unknown) => ({ ok: true, args }))
    const completionManual = vi.fn((args: unknown) => ({ ok: true, checked: args }))

    const manualScenario: AiScenarioDefinition = {
      id: 'scenario.manual',
      title: 'Manual Completion',
      scope: 'business',
      intents: ['manual'],
      promptPolicy: { systemPrompt: 'manual prompt' },
      completion: {
        mode: 'manual',
        tools: ['completion.check'],
      },
      tools: [
        createTool('main.run', mainManual),
        createTool('completion.check', completionManual),
      ],
    }

    const runtimeManual = createScenarioRuntime([manualScenario], { completionMode: 'auto' })

    // 阶段 5：执行 manual 场景
    const manualResult = await runtimeManual.run({
      scenarioId: 'scenario.manual',
      userInput: 'run manual',
      toolCalls: [{ tool: 'main.run', args: { value: 2 } }],
    })

    // 阶段 6：断言 manual completion 未执行
    expect(manualResult.status).toBe('completed')
    expect(manualResult.executions.map((item) => item.tool)).toEqual(['main.run'])
    expect(mainManual).toHaveBeenCalledTimes(1)
    expect(completionManual).toHaveBeenCalledTimes(0)
  })

  /**
   * 用例 2：模板回退策略。
   * 当 promptTemplateId 未命中模板注册中心时，应回退到静态 systemPrompt。
   */
  it('falls back to static systemPrompt when prompt template is unavailable', async () => {
    // 阶段 1：构造仅包含静态回退提示词的场景
    const runtime = createScenarioRuntime([
      {
        id: 'scenario.fallback',
        title: 'Template Fallback',
        scope: 'design',
        intents: ['fallback'],
        promptPolicy: {
          promptTemplateId: 'template.not.exists',
          systemPrompt: 'fallback prompt text',
        },
        tools: [createTool('main.run', () => ({ ok: true }))],
      },
    ], {
      promptTemplates: createScenarioPromptTemplateRegistry([]),
    })

    // 阶段 2：dryRun 触发提示词解析
    const result = await runtime.run({
      scenarioId: 'scenario.fallback',
      userInput: 'dry run',
      dryRun: true,
    })

    // 阶段 3：断言回退生效
    expect(result.status).toBe('planned')
    expect(result.systemPrompt).toBe('fallback prompt text')
  })

  /**
   * 用例 3：历史查询与 registry 代理。
   * 验证：
   * 1) queryRunHistory 支持分页
   * 2) queryRunHistory 支持 scenarioId/status 过滤
   * 3) queryRunRecord 可按 runId 查询
   */
  it('supports history filter/page and registry queryRunHistory proxy', async () => {
    // 阶段 1：准备两个场景
    const scenarioA: AiScenarioDefinition = {
      id: 'scenario.history.a',
      title: 'History A',
      scope: 'business',
      intents: ['a'],
      promptPolicy: { systemPrompt: 'prompt a' },
      tools: [createTool('a.run', () => ({ ok: true }))],
    }

    const scenarioB: AiScenarioDefinition = {
      id: 'scenario.history.b',
      title: 'History B',
      scope: 'planning',
      intents: ['b'],
      promptPolicy: { systemPrompt: 'prompt b' },
      tools: [createTool('b.run', () => ({ ok: true }))],
    }

    const runtime = createScenarioRuntime([scenarioA, scenarioB])

    // 阶段 2：构造三次运行（成功/失败/成功）
    const first = await runtime.run({
      scenarioId: 'scenario.history.a',
      userInput: 'ok a',
      toolCalls: [{ tool: 'a.run', args: { id: 1 } }],
    })

    const second = await runtime.run({
      scenarioId: 'scenario.history.a',
      userInput: 'fail a',
      toolCalls: [{ tool: 'a.missing', args: { id: 2 } }],
    })

    const third = await runtime.run({
      scenarioId: 'scenario.history.b',
      userInput: 'ok b',
      toolCalls: [{ tool: 'b.run', args: { id: 3 } }],
    })

    expect(first.status).toBe('completed')
    expect(second.status).toBe('failed')
    expect(third.status).toBe('completed')

    // 阶段 3：分页查询断言
    const page0 = runtime.registry.queryRunHistory({ offset: 0, limit: 2 })
    expect(page0.total).toBe(3)
    expect(page0.items).toHaveLength(2)
    expect(page0.hasMore).toBe(true)

    // 阶段 4：过滤查询断言
    const scenarioACompleted = runtime.registry.queryRunHistory({
      scenarioId: 'scenario.history.a',
      status: 'completed',
      offset: 0,
      limit: 10,
    })
    expect(scenarioACompleted.total).toBe(1)
    expect(scenarioACompleted.items).toHaveLength(1)
    expect(scenarioACompleted.items[0]?.result.scenario.id).toBe('scenario.history.a')
    expect(scenarioACompleted.items[0]?.result.status).toBe('completed')

    // 阶段 5：单条记录查询断言
    const record = runtime.registry.queryRunRecord(first.runId)
    expect(record?.runId).toBe(first.runId)
  })
})
