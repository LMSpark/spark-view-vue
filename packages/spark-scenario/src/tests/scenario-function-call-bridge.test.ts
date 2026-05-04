import { describe, expect, it, vi } from 'vitest'
import {
  createScenarioFunctionCallBridge,
  createScenarioRuntime,
  type AiScenarioContext,
  type AiScenarioDefinition,
  type AiScenarioTool,
} from '../index'

/**
 * ==============================================
 * 回归测试：scenario function-call bridge
 * ==============================================
 * 功能分区：
 * 1) 验证场景工具可投影为 AI 框架 function definition。
 * 2) 验证前端执行宿主可复用 runtime.run 完成 FC 调用。
 * 3) 验证后端执行宿主不会在前端被误执行。
 * 4) 验证函数名映射冲突会 fail-fast。
 *
 * 时序分区：
 * 1) 准备场景、工具与 runtime。
 * 2) 创建 function-call bridge 并读取函数目录。
 * 3) 模拟 AI 框架发起 function call。
 * 4) 校验执行结果、执行宿主与错误边界。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：测试场景构造器
// ═══════════════════════════════════════════════════════════════════════════

function createExecutableTool(
  name: string,
  execute: (args: unknown, context: AiScenarioContext) => unknown,
): AiScenarioTool {
  return {
    name,
    description: `工具：${name}`,
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'string', description: '测试值' },
      },
    },
    execute: (args, context) => execute(args, context),
  }
}

function createScenario(id: string, tools: readonly AiScenarioTool[]): AiScenarioDefinition {
  return {
    id,
    title: `场景：${id}`,
    scope: 'business',
    intents: [id],
    promptPolicy: { systemPrompt: `提示词：${id}` },
    tools,
  }
}

describe('scenario function-call bridge', () => {
  /**
   * 用例 1：函数目录投影。
   * 未显式声明 execution 的旧工具应默认按 frontend/tool 处理，保持兼容。
   */
  it('projects scenario tools to function definitions with frontend default execution', () => {
    // 阶段 1：准备仅包含旧式工具注册信息的场景
    const runtime = createScenarioRuntime([
      createScenario('scenario.leave', [
        createExecutableTool('leave.submit', () => ({ ok: true })),
      ]),
    ])

    // 阶段 2：读取桥接器函数目录
    const bridge = createScenarioFunctionCallBridge(runtime)
    const definitions = bridge.listFunctionDefinitions()

    // 阶段 3：断言默认执行宿主与映射信息
    expect(definitions).toHaveLength(1)
    expect(definitions[0]?.name).toBe('scenario_leave__leave_submit')
    expect(definitions[0]?.scenarioId).toBe('scenario.leave')
    expect(definitions[0]?.toolName).toBe('leave.submit')
    expect(definitions[0]?.execution).toEqual({ host: 'frontend', kind: 'tool' })
    expect(definitions[0]?.parameters?.properties['value']?.description).toBe('测试值')
  })

  /**
   * 用例 2：前端 FC 执行。
   * AI 框架传入 JSON 字符串参数时，bridge 应解析后交给 runtime.run。
   */
  it('executes frontend function call through scenario runtime', async () => {
    // 阶段 1：准备带 execute 的前端工具
    const executeSubmit = vi.fn((args: unknown) => ({ submitted: true, args }))
    const runtime = createScenarioRuntime([
      createScenario('scenario.leave', [
        createExecutableTool('leave.submit', executeSubmit),
      ]),
    ])
    const bridge = createScenarioFunctionCallBridge(runtime)

    // 阶段 2：模拟 provider 产生 function_call
    const result = await bridge.executeFunctionCall({
      id: 'call-1',
      name: 'scenario_leave__leave_submit',
      arguments: '{"value":"annual"}',
      userInput: '提交年假申请',
      context: { pageId: 'page.leave' },
      session: { sessionId: 'session-1' },
    })

    // 阶段 3：断言执行结果与运行历史投影
    expect(result.ok).toBe(true)
    expect(result.status).toBe('executed')
    expect(result.executionHost).toBe('frontend')
    expect(result.scenarioId).toBe('scenario.leave')
    expect(result.toolName).toBe('leave.submit')
    expect(result.result).toEqual({ submitted: true, args: { value: 'annual' } })
    expect(executeSubmit).toHaveBeenCalledWith({ value: 'annual' }, expect.objectContaining({ pageId: 'page.leave' }))
  })

  /**
   * 用例 3：后端 FC 分流。
   * 后端工具只返回 requires-backend 指示，前端 bridge 不直接执行 execute。
   */
  it('returns backend execution directive without running backend tool in frontend bridge', async () => {
    // 阶段 1：准备后端执行宿主工具
    const executeBackendTool = vi.fn(() => ({ shouldNotRun: true }))
    const runtime = createScenarioRuntime([
      createScenario('scenario.report', [
        {
          ...createExecutableTool('report.query', executeBackendTool),
          registration: {
            execution: {
              host: 'backend',
              kind: 'query',
              backendRoute: '/api/ai/scenario-functions/report.query',
            },
          },
        },
      ]),
    ])
    const bridge = createScenarioFunctionCallBridge(runtime)

    // 阶段 2：模拟 AI 框架请求执行后端 FC
    const result = await bridge.executeFunctionCall({
      id: 'call-backend',
      name: 'scenario_report__report_query',
      arguments: { value: '2026' },
    })

    // 阶段 3：断言前端未执行，结果携带后端路由
    expect(result.ok).toBe(false)
    expect(result.status).toBe('requires-backend')
    expect(result.executionHost).toBe('backend')
    expect(result.backendRoute).toBe('/api/ai/scenario-functions/report.query')
    expect(executeBackendTool).not.toHaveBeenCalled()
  })

  /**
   * 用例 4：名称冲突 fail-fast。
   * 默认名称映射会规范化点号与下划线；冲突时应立即抛错，而不是延迟到执行期误路由。
   */
  it('fails fast when normalized function names collide', () => {
    // 阶段 1：准备规范化后函数名相同的两个场景工具
    const runtime = createScenarioRuntime([
      createScenario('scenario.leave', [
        createExecutableTool('tool.submit', () => ({ ok: true })),
      ]),
      createScenario('scenario_leave', [
        createExecutableTool('tool_submit', () => ({ ok: true })),
      ]),
    ])
    const bridge = createScenarioFunctionCallBridge(runtime)

    // 阶段 2：读取函数目录时触发冲突检测
    expect(() => bridge.listFunctionDefinitions()).toThrow(
      'Duplicate scenario function name: scenario_leave__tool_submit',
    )
  })

  /**
   * 用例 5：未知函数名错误边界。
   * 未注册 function call 应返回结构化 failed 结果，便于 AI 框架按 callId 回写。
   */
  it('returns structured failed result for unknown function name', async () => {
    // 阶段 1：准备空运行时与桥接器
    const runtime = createScenarioRuntime([])
    const bridge = createScenarioFunctionCallBridge(runtime)

    // 阶段 2：执行未知函数
    const result = await bridge.executeFunctionCall({
      id: 'call-missing',
      name: 'missing_function',
    })

    // 阶段 3：断言结构化失败结果
    expect(result).toMatchObject({
      callId: 'call-missing',
      functionName: 'missing_function',
      ok: false,
      status: 'failed',
      executionHost: 'frontend',
      error: 'Function not registered: missing_function',
    })
  })
})
