/**
 * @module @spark-appworks/spark-ai:agent/tool-runtime/tool-runtime-types
 * 职责：定义 AI 工具运行时的工具规格、校验等级、执行结果、知识投影和 inspect 报告等核心类型。
 * 边界：只声明工具运行协议，不实现具体工具、不控制 LLM 循环，也不处理传输层 SSE。
 * AI用途：新增或诊断工具时，用本模块确认 tool spec、tool result 和 runtime host context 的语义。
 */
import type { AiJsonParams, AiJsonSchemaObject, AiJsonValue } from '../../json'

/** Ai Agent Tool Check Level 的语义模型。 */
export type AiAgentToolCheckLevel = 'error' | 'warn' | 'info'

/** Ai Agent Tool Check 的语义模型。 */
export class AiAgentToolCheck {
    /** 创建 Ai Agent Tool Check 实例。 */
public constructor(
    /** 检查等级：error 会阻断，warn/info 用于提示。 */
    public readonly level: AiAgentToolCheckLevel,
    /** 稳定检查码，供 UI 和恢复提示识别问题类型。 */
    public readonly code: string,
    /** 面向用户或日志的检查说明。 */
    public readonly message: string,
    /** 可选修复提示。 */
    public readonly hint?: string,
  ) {}

    /** 错误对象或错误信息。 */
public static error(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('error', code, message, hint)
  }

    /** 执行 warn 操作。 */
public static warn(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('warn', code, message, hint)
  }

    /** 执行 info 操作。 */
public static info(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('info', code, message, hint)
  }
}

/** Ai Agent Tool Result Options 的调用配置。 */
export type AiAgentToolResultOptions<TData> = Readonly<{
  ok: boolean
  data?: TData
  checks?: readonly AiAgentToolCheck[]
  state?: Record<string, unknown>
}>

/** Ai Agent Tool Result 的返回结果。 */
export class AiAgentToolResult<TData = unknown> {
    /** ok 字段。 */
public readonly ok: boolean
    /** 业务数据载荷。 */
public readonly data?: TData
    /** checks 字段。 */
public readonly checks?: readonly AiAgentToolCheck[]
    /** 当前运行状态。 */
public readonly state?: Record<string, unknown>

    /** 创建 Ai Agent Tool Result 实例。 */
public constructor(options: AiAgentToolResultOptions<TData>) {
    this.ok = options.ok
    if ('data' in options) this.data = options.data
    const checks = nonEmptyChecks(options.checks)
    if (checks !== undefined) this.checks = checks
    if (options.state !== undefined) this.state = options.state
  }

  /** 构造成功的工具执行结果。 */
  public static ok<TData>(
    data?: TData,
    checks?: readonly AiAgentToolCheck[],
    state?: Record<string, unknown>,
  ): AiAgentToolResult<TData> {
    return new AiAgentToolResult({
      ok: true,
      ...(data === undefined ? {} : { data }),
      ...(checks === undefined ? {} : { checks }),
      ...(state === undefined ? {} : { state }),
    })
  }

    /** 执行 fail 操作。 */
public static fail(
    checks: readonly AiAgentToolCheck[],
    state?: Record<string, unknown>,
  ): AiAgentToolResult<never> {
    if (checks.length === 0) {
      throw new Error('AiAgentToolResult.fail requires at least one AiAgentToolCheck')
    }
    return new AiAgentToolResult({
      ok: false,
      checks,
      ...(state === undefined ? {} : { state }),
    })
  }

    /** 执行 fail Code 操作。 */
public static failCode(code: string, message: string, hint?: string): AiAgentToolResult<never> {
    return AiAgentToolResult.fail([AiAgentToolCheck.error(code, message, hint)])
  }

    /** 执行 passthrough Failure 操作。 */
public static passthroughFailure(result: AiAgentToolResult<unknown>): AiAgentToolResult<never> {
    return new AiAgentToolResult({
      ok: false,
      ...(result.checks === undefined ? {} : { checks: result.checks }),
      ...(result.state === undefined ? {} : { state: result.state }),
    })
  }
}

/** Ai Agent Tool Spec 的语义模型。 */
export type AiAgentToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: AiJsonSchemaObject
    readonly strict?: boolean
  }
}>

/** Ai Agent Runtime Host Context 的运行上下文。 */
export type AiAgentRuntimeHostContext = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
}>

/** Ai Agent Tool Runtime Knowledge Projection 的语义模型。 */
export type AiAgentToolRuntimeKnowledgeProjection = Readonly<{
  promptSnapshot: string
}>

/** Ai Agent Tool Runtime Inspect Finding 的语义模型。 */
export type AiAgentToolRuntimeInspectFinding = Readonly<{
  level: 'error' | 'warn' | 'info'
  code: string
  message: string
  fix?: string
}>

/** Ai Agent Tool Runtime Inspect Report 的语义模型。 */
export type AiAgentToolRuntimeInspectReport = Readonly<{
  status: 'ok' | 'warning' | 'error'
  rootKinds: readonly string[]
  moduleCount: number
  findings: readonly AiAgentToolRuntimeInspectFinding[]
}>

/** Ai Agent Tool Runtime 的语义模型。 */
export type AiAgentToolRuntime = Readonly<{
  getTools(): readonly AiAgentToolSpec[]
  executeTool(
    toolName: string,
    args: AiJsonParams,
    host: AiAgentRuntimeHostContext,
  ): Promise<AiAgentToolResult<AiJsonValue>>
  projectKnowledge(): AiAgentToolRuntimeKnowledgeProjection
  inspect(): AiAgentToolRuntimeInspectReport
}>

function nonEmptyChecks(
  checks: readonly AiAgentToolCheck[] | undefined,
): readonly AiAgentToolCheck[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}
