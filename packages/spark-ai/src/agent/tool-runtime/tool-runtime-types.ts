import type { AiJsonParams, AiJsonSchemaObject, AiJsonValue } from '../../json'

export type AiAgentToolCheckLevel = 'error' | 'warn' | 'info'

export class AiAgentToolCheck {
  public constructor(
    public readonly level: AiAgentToolCheckLevel,
    public readonly code: string,
    public readonly message: string,
    public readonly hint?: string,
  ) {}

  public static error(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('error', code, message, hint)
  }

  public static warn(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('warn', code, message, hint)
  }

  public static info(code: string, message: string, hint?: string): AiAgentToolCheck {
    return new AiAgentToolCheck('info', code, message, hint)
  }
}

export type AiAgentToolResultOptions<TData> = Readonly<{
  ok: boolean
  data?: TData
  checks?: readonly AiAgentToolCheck[]
  state?: Record<string, unknown>
}>

export class AiAgentToolResult<TData = unknown> {
  public readonly ok: boolean
  public readonly data?: TData
  public readonly checks?: readonly AiAgentToolCheck[]
  public readonly state?: Record<string, unknown>

  public constructor(options: AiAgentToolResultOptions<TData>) {
    this.ok = options.ok
    if ('data' in options) this.data = options.data
    const checks = nonEmptyChecks(options.checks)
    if (checks !== undefined) this.checks = checks
    if (options.state !== undefined) this.state = options.state
  }

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

  public static failCode(code: string, message: string, hint?: string): AiAgentToolResult<never> {
    return AiAgentToolResult.fail([AiAgentToolCheck.error(code, message, hint)])
  }

  public static passthroughFailure(result: AiAgentToolResult<unknown>): AiAgentToolResult<never> {
    return new AiAgentToolResult({
      ok: false,
      ...(result.checks === undefined ? {} : { checks: result.checks }),
      ...(result.state === undefined ? {} : { state: result.state }),
    })
  }
}

export type AiAgentToolSpec = Readonly<{
  type: 'function'
  function: {
    readonly name: string
    readonly description: string
    readonly parameters: AiJsonSchemaObject
    readonly strict?: boolean
  }
}>

export type AiAgentRuntimeHostContext = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
}>

export type AiAgentToolRuntimeKnowledgeProjection = Readonly<{
  promptSnapshot: string
}>

export type AiAgentToolRuntimeInspectFinding = Readonly<{
  level: 'error' | 'warn' | 'info'
  code: string
  message: string
  fix?: string
}>

export type AiAgentToolRuntimeInspectReport = Readonly<{
  status: 'ok' | 'warning' | 'error'
  rootKinds: readonly string[]
  moduleCount: number
  findings: readonly AiAgentToolRuntimeInspectFinding[]
}>

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
