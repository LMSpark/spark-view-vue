/**
 * module-semantic · 操作结果原语
 *
 * 统一的操作结果类型。所有协议操作（属性读写、动作调用、子实例查询等）
 * 都通过 ModuleOperationResult<T> 返回，提供统一的 ok/checks 诊断模式。
 *
 * 借鉴 Rust Result 模式，保留多级诊断：
 *   ok=true  → 操作成功，可选 data + info/warn 级 checks
 *   ok=false → 操作失败，至少一条 error 级 check（code + message + hint）
 *   checks 支持三级：error（终止）/ warn（提醒）/ info（告知）
 *
 * 依赖顺序：ModuleCheckEntry → ModuleOperationResult<T> → 内部辅助
 */

// ============================================================================
// 一、诊断条目 — ModuleCheckEntry
//
// 操作结果的最小诊断单元。
//   error — 导致操作失败的根本原因（必须附带修复建议 hint）
//   warn  — 操作成功但存在值得关注的问题
//   info  — 纯信息性提示
// ============================================================================

export type ModuleCheckEntryLevel = 'error' | 'warn' | 'info'

export class ModuleCheckEntry {
  public constructor(
    public readonly level: ModuleCheckEntryLevel,
    public readonly code: string,
    public readonly message: string,
    public readonly hint?: string,
  ) {}

  /** error 级：导致操作失败的根本原因 */
  public static error(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('error', code, message, hint)
  }

  /** warn 级：操作成功但存在值得关注的问题 */
  public static warn(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('warn', code, message, hint)
  }

  /** info 级：纯信息性提示 */
  public static info(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('info', code, message, hint)
  }
}

// ============================================================================
// 二、操作结果 — ModuleOperationResult<TData>
//
// 泛型结果容器，所有协议操作的统一返回类型。
//   TData=void                          → setAttribute
//   TData=LlmJsonValue                  → getAttribute / 业务函数调用
//   TData=readonly ModuleInstanceRef[]  → listChildren / findInstance
//
// 关键约束：
//   fail() 要求至少一条 check，杜绝"沉默失败"
//   failCode() 是 fail([error(code, msg, hint)]) 的简写
//   passthroughFailure() 透传上游 checks + state，保留完整错误链
// ============================================================================

export type ModuleOperationResultOptions<TData> = Readonly<{
  ok: boolean
  data?: TData
  checks?: readonly ModuleCheckEntry[]
  state?: Record<string, unknown>
}>

export class ModuleOperationResult<TData = unknown> {
  public readonly ok: boolean
  public readonly data?: TData
  public readonly checks?: readonly ModuleCheckEntry[]
  public readonly state?: Record<string, unknown>

  public constructor(options: ModuleOperationResultOptions<TData>) {
    this.ok = options.ok
    if ('data' in options) {
      this.data = options.data
    }
    const checks = nonEmptyChecks(options.checks)
    if (checks !== undefined) {
      this.checks = checks
    }
    if (options.state !== undefined) {
      this.state = options.state
    }
  }

  /** 成功结果，可选 data + checks + state */
  public static ok<TData>(
    data?: TData,
    checks?: readonly ModuleCheckEntry[],
    state?: Record<string, unknown>,
  ): ModuleOperationResult<TData> {
    return new ModuleOperationResult({
      ok: true,
      ...(data === undefined ? {} : { data }),
      ...(checks === undefined ? {} : { checks }),
      ...(state === undefined ? {} : { state }),
    })
  }

  /** 失败结果，至少一条 check */
  public static fail(
    checks: readonly ModuleCheckEntry[],
    state?: Record<string, unknown>,
  ): ModuleOperationResult<never> {
    if (checks.length === 0) {
      throw new Error('ModuleOperationResult.fail requires at least one ModuleCheckEntry')
    }
    return new ModuleOperationResult({
      ok: false,
      checks,
      ...(state === undefined ? {} : { state }),
    })
  }

  /** 失败简写：自动包装单条 error 级 check */
  public static failCode(code: string, message: string, hint?: string): ModuleOperationResult<never> {
    return ModuleOperationResult.fail([ModuleCheckEntry.error(code, message, hint)])
  }

  /** 透传上游失败结果，保留原始 checks + state，不丢失错误链信息 */
  public static passthroughFailure(result: ModuleOperationResult<unknown>): ModuleOperationResult<never> {
    return new ModuleOperationResult({
      ok: false,
      ...(result.checks === undefined ? {} : { checks: result.checks }),
      ...(result.state === undefined ? {} : { state: result.state }),
    })
  }
}

// ============================================================================
// 三、内部辅助
// ============================================================================

/** 空数组视为 undefined，避免"有 checks 但全空"的语义混淆 */
function nonEmptyChecks(checks: readonly ModuleCheckEntry[] | undefined): readonly ModuleCheckEntry[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}
