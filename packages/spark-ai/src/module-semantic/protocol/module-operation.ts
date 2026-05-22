/**
 * Module semantic operation result primitives.
 */

export type ModuleCheckEntryLevel = 'error' | 'warn' | 'info'

export class ModuleCheckEntry {
  public constructor(
    public readonly level: ModuleCheckEntryLevel,
    public readonly code: string,
    public readonly message: string,
    public readonly hint?: string | undefined,
  ) {}

  public static error(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('error', code, message, hint)
  }

  public static warn(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('warn', code, message, hint)
  }

  public static info(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('info', code, message, hint)
  }
}

export type ModuleOperationResultOptions<TData> = Readonly<{
  ok: boolean
  data?: TData | undefined
  checks?: readonly ModuleCheckEntry[] | undefined
  state?: Record<string, unknown> | undefined
}>

export class ModuleOperationResult<TData = unknown> {
  public readonly ok: boolean
  public readonly data?: TData | undefined
  public readonly checks?: readonly ModuleCheckEntry[] | undefined
  public readonly state?: Record<string, unknown> | undefined

  public constructor(options: ModuleOperationResultOptions<TData>) {
    this.ok = options.ok
    this.data = options.data
    this.checks = nonEmptyChecks(options.checks)
    this.state = options.state
  }

  public static ok<TData>(
    data?: TData,
    checks?: readonly ModuleCheckEntry[],
    state?: Record<string, unknown>,
  ): ModuleOperationResult<TData> {
    return new ModuleOperationResult({ ok: true, data, checks, state })
  }

  public static fail(
    checks: readonly ModuleCheckEntry[],
    state?: Record<string, unknown>,
  ): ModuleOperationResult<never> {
    if (checks.length === 0) {
      throw new Error('ModuleOperationResult.fail requires at least one ModuleCheckEntry')
    }
    return new ModuleOperationResult({ ok: false, checks, state })
  }

  public static failCode(code: string, message: string, hint?: string): ModuleOperationResult<never> {
    return ModuleOperationResult.fail([ModuleCheckEntry.error(code, message, hint)])
  }

  public static passthroughFailure(result: ModuleOperationResult<unknown>): ModuleOperationResult<never> {
    return new ModuleOperationResult({ ok: false, checks: result.checks, state: result.state })
  }
}

function nonEmptyChecks(checks: readonly ModuleCheckEntry[] | undefined): readonly ModuleCheckEntry[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}
