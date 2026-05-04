import type { AiScenarioRuntime } from './scenario-runtime'
import type {
  AiScenarioDefinition,
  AiScenarioTool,
  AiScenarioToolExecutionRegistration,
} from '../contracts/scenario-types'
import type {
  AiScenarioFunctionCall,
  AiScenarioFunctionCallResult,
  AiScenarioFunctionDefinition,
} from '../contracts/function-call-contracts'

/**
 * ==============================================
 * 运行时层：场景 Function Calling 桥接器
 * ==============================================
 * 功能分区：
 * 1) 把 registry 中的场景工具投影为 AI 框架 function definitions。
 * 2) 根据 functionName 解析 scenarioId + toolName。
 * 3) 仅执行 registration.execution.host=frontend 的工具。
 * 4) 对 backend 工具返回明确的后端执行指示，避免前端误执行。
 *
 * 流程分区：
 * 1) listFunctionDefinitions()：面向 AI 框架暴露当前可调用函数目录。
 * 2) resolveFunctionName()：把 provider 返回的函数名还原到场景工具。
 * 3) executeFunctionCall()：承接 AI 框架的 FC 请求并回写执行结果。
 *
 * 时序分区：
 * 1) Agent/LLM 发起 turn 前读取 function definitions。
 * 2) Agent/LLM 在 SSE turn 中产生 function_call。
 * 3) 场景桥接器按执行宿主分流：frontend 本地执行，backend 返回后端执行指示。
 * 4) 调用方把 AiScenarioFunctionCallResult 回交给 AI 框架继续推理。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：桥接器公开类型
// ═══════════════════════════════════════════════════════════════════════════

export interface AiScenarioFunctionNameMapperInput {
  scenarioId: string
  toolName: string
}

export type AiScenarioFunctionNameMapper = (input: AiScenarioFunctionNameMapperInput) => string

export interface AiScenarioFunctionCallBridgeOptions {
  functionNameMapper?: AiScenarioFunctionNameMapper
  defaultExecution?: AiScenarioToolExecutionRegistration
}

export interface AiScenarioFunctionResolution {
  functionName: string
  scenarioId: string
  toolName: string
  definition: AiScenarioFunctionDefinition
  execution: AiScenarioToolExecutionRegistration
}

export interface AiScenarioFunctionCallBridge {
  listFunctionDefinitions: () => readonly AiScenarioFunctionDefinition[]
  resolveFunctionName: (functionName: string) => AiScenarioFunctionResolution | undefined
  executeFunctionCall: (call: AiScenarioFunctionCall) => Promise<AiScenarioFunctionCallResult>
}

type FunctionIndexEntry = {
  scenario: AiScenarioDefinition
  tool: AiScenarioTool
  definition: AiScenarioFunctionDefinition
  execution: AiScenarioToolExecutionRegistration
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：默认策略与名称规范化
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_FRONTEND_EXECUTION: AiScenarioToolExecutionRegistration = {
  host: 'frontend',
  kind: 'tool',
}

/**
 * 把场景 id / 工具名转换成 provider 侧更容易接受的函数名片段。
 * 保留字母、数字、下划线、短横线；其他字符统一压缩为下划线。
 */
function safeIdentifierPart(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (normalized !== '') return normalized

  const fallback = Array.from(value)
    .map((char) => char.codePointAt(0)?.toString(36) ?? '0')
    .join('_')
  return fallback !== '' ? fallback : 'unnamed'
}

/** 默认函数名策略：scenario 与 tool 双段拼接，降低跨场景同名工具冲突概率。 */
function defaultFunctionNameMapper(input: AiScenarioFunctionNameMapperInput): string {
  const safeName = `${safeIdentifierPart(input.scenarioId)}__${safeIdentifierPart(input.toolName)}`
  return /^[A-Za-z_]/.test(safeName) ? safeName : `_${safeName}`
}

/** 未声明 execution 时默认按前端 FC 处理，兼容既有纯前端场景工具。 */
function resolveExecution(
  tool: AiScenarioTool,
  defaultExecution: AiScenarioToolExecutionRegistration | undefined,
): AiScenarioToolExecutionRegistration {
  return tool.registration?.execution ?? defaultExecution ?? DEFAULT_FRONTEND_EXECUTION
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：参数解析与函数定义投影
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 兼容两类 provider 参数形态：
 * - 已解析对象：直接传给 runtime。
 * - JSON 字符串：先 parse，失败时由调用链返回结构化 failed 结果。
 */
function parseFunctionArguments(rawArguments: unknown): unknown {
  if (typeof rawArguments !== 'string') return rawArguments
  const trimmed = rawArguments.trim()
  if (trimmed === '') return undefined
  return JSON.parse(trimmed) as unknown
}

/** 把单个场景工具投影成 AI 框架可消费的 function definition。 */
function buildFunctionDefinition(params: {
  functionName: string
  scenario: AiScenarioDefinition
  tool: AiScenarioTool
  execution: AiScenarioToolExecutionRegistration
}): AiScenarioFunctionDefinition {
  const { functionName, scenario, tool, execution } = params
  return {
    name: functionName,
    description: tool.description,
    ...(tool.parameters !== undefined ? { parameters: tool.parameters } : {}),
    scenarioId: scenario.id,
    toolName: tool.name,
    execution,
    metadata: {
      scenarioTitle: scenario.title,
      scope: scenario.scope,
      tags: tool.registration?.tags ?? [],
      category: tool.registration?.category ?? '',
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：索引构建与冲突检测
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 每次读取 registry 快照重建索引，确保动态 register/unregister 后 bridge 立刻反映最新状态。
 * 若函数名映射发生冲突，立即抛错，避免 Agent 调用时误路由到错误工具。
 */
function buildFunctionIndex(
  runtime: AiScenarioRuntime,
  options: AiScenarioFunctionCallBridgeOptions,
): Map<string, FunctionIndexEntry> {
  const mapper = options.functionNameMapper ?? defaultFunctionNameMapper
  const index = new Map<string, FunctionIndexEntry>()

  for (const scenario of runtime.registry.list()) {
    for (const tool of scenario.tools) {
      const functionName = mapper({ scenarioId: scenario.id, toolName: tool.name }).trim()
      if (functionName === '') {
        throw new Error(`Function name mapper returned empty name for ${scenario.id}.${tool.name}`)
      }
      const execution = resolveExecution(tool, options.defaultExecution)
      const definition = buildFunctionDefinition({ functionName, scenario, tool, execution })
      const existing = index.get(functionName)
      if (existing !== undefined) {
        throw new Error(
          `Duplicate scenario function name: ${functionName}; `
          + `first=${existing.scenario.id}.${existing.tool.name}; second=${scenario.id}.${tool.name}`,
        )
      }
      index.set(functionName, { scenario, tool, definition, execution })
    }
  }

  return index
}

// ═══════════════════════════════════════════════════════════════════════════
// 功能分区：结果构造
// ═══════════════════════════════════════════════════════════════════════════

/** backend 工具在前端桥接器中只返回执行指示，不直接调用远端能力。 */
function backendDirectiveResult(
  call: AiScenarioFunctionCall,
  entry: FunctionIndexEntry,
): AiScenarioFunctionCallResult {
  const backendRoute = entry.execution.backendRoute
  const error = backendRoute === undefined || backendRoute.trim() === ''
    ? `Function ${call.name} is registered as backend execution but has no backendRoute.`
    : `Function ${call.name} requires backend execution via ${backendRoute}.`

  return {
    callId: call.id,
    functionName: call.name,
    ok: false,
    status: 'requires-backend',
    executionHost: 'backend',
    scenarioId: entry.scenario.id,
    toolName: entry.tool.name,
    ...(backendRoute !== undefined ? { backendRoute } : {}),
    error,
  }
}

/** 统一失败结果形状，便于 AI 框架按 callId 回填。 */
function failedResult(
  call: AiScenarioFunctionCall,
  message: string,
  entry?: FunctionIndexEntry,
): AiScenarioFunctionCallResult {
  return {
    callId: call.id,
    functionName: call.name,
    ok: false,
    status: 'failed',
    executionHost: entry?.execution.host ?? 'frontend',
    ...(entry !== undefined ? { scenarioId: entry.scenario.id, toolName: entry.tool.name } : {}),
    error: message,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 流程分区：桥接器实现
// ═══════════════════════════════════════════════════════════════════════════

/** 创建场景 FC 桥接器。 */
export function createScenarioFunctionCallBridge(
  runtime: AiScenarioRuntime,
  options: AiScenarioFunctionCallBridgeOptions = {},
): AiScenarioFunctionCallBridge {
  /** 阶段 1：暴露当前 function definitions 目录。 */
  function listFunctionDefinitions(): readonly AiScenarioFunctionDefinition[] {
    return Array.from(buildFunctionIndex(runtime, options).values()).map((entry) => entry.definition)
  }

  /** 阶段 2：按函数名解析到场景工具与执行元数据。 */
  function resolveFunctionName(functionName: string): AiScenarioFunctionResolution | undefined {
    const entry = buildFunctionIndex(runtime, options).get(functionName)
    if (entry === undefined) return undefined
    return {
      functionName,
      scenarioId: entry.scenario.id,
      toolName: entry.tool.name,
      definition: entry.definition,
      execution: entry.execution,
    }
  }

  /** 阶段 3：接收 AI 框架的一次 FC 请求并按执行宿主分流。 */
  async function executeFunctionCall(call: AiScenarioFunctionCall): Promise<AiScenarioFunctionCallResult> {
    const entry = buildFunctionIndex(runtime, options).get(call.name)
    if (entry === undefined) {
      return failedResult(call, `Function not registered: ${call.name}`)
    }

    if (entry.execution.host === 'backend') {
      return backendDirectiveResult(call, entry)
    }

    // 阶段 3.1：解析 provider 参数。
    let args: unknown
    try {
      args = parseFunctionArguments(call.arguments)
    } catch (error) {
      return failedResult(
        call,
        `Function arguments JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
        entry,
      )
    }

    // 阶段 3.2：复用 runtime.run，保持历史记录、失败格式和 completion 策略一致。
    const toolCall = args === undefined
      ? { tool: entry.tool.name }
      : { tool: entry.tool.name, args }
    const runResult = await runtime.run({
      scenarioId: entry.scenario.id,
      userInput: call.userInput ?? `Function call: ${call.name}`,
      ...(call.context !== undefined ? { context: call.context } : {}),
      toolCalls: [toolCall],
    })
    const execution = runResult.executions[0]

    if (execution === undefined) {
      return failedResult(call, `Function ${call.name} produced no execution record.`, entry)
    }

    // 阶段 3.3：把 runtime 执行记录投影回 FC 结果。
    return {
      callId: call.id,
      functionName: call.name,
      ok: execution.ok,
      status: execution.ok ? 'executed' : 'failed',
      executionHost: 'frontend',
      scenarioId: entry.scenario.id,
      toolName: entry.tool.name,
      ...(execution.result !== undefined ? { result: execution.result } : {}),
      ...(execution.error !== undefined ? { error: execution.error } : {}),
      raw: runResult,
    }
  }

  return {
    listFunctionDefinitions,
    resolveFunctionName,
    executeFunctionCall,
  }
}
