/**
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  MODULE-SEMANTIC · 操作结果原语                                               │
 * │  Operation Result Primitives                                                  │
 * │                                                                              │
 * │  本文件定义 module-semantic 层的统一操作结果类型。                              │
 * │  所有协议层操作（属性读写、动作调用、子实例查询等）都通过                        │
 * │  ModuleOperationResult<T> 返回，提供统一的 ok/checks 模式。                    │
 * │                                                                              │
 * │  设计理念（与 Rust Result 对比）：                                             │
 * │    · ok=true  → 操作成功，可选携带 data + info/warn 级 checks                 │
 * │    · ok=false → 操作失败，携带至少一条 error 级 check（code + message + hint） │
 * │    · checks 支持多级别级联（error 终止 / warn 提醒 / info 告知）              │
 * │                                                                              │
 * │  与 Host 层的映射：result-mapper.ts 将 ModuleOperationResult 投影为            │
 * │  AiHostFunctionCallResult（ok + summary / code + msg + fix）。                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 */

/* -------------------------------------------------------------------------------
 * 一、检查条目
 * -------------------------------------------------------------------------------
 * ModuleCheckEntry 是操作结果的最小诊断单元，三个级别：
 *   · error — 导致操作失败的根本原因
 *   · warn  — 操作成功但存在值得关注的问题
 *   · info  — 纯信息性提示
 * ----------------------------------------------------------------------------- */

export type ModuleCheckEntryLevel = 'error' | 'warn' | 'info'

/**
 * 操作结果的最小诊断单元。
 * level   — 严重级别：error（导致失败）/ warn（成功但有风险）/ info（纯信息）
 * code    — 错误码（机器可读）
 * message — 人类可读描述
 * hint    — 修复建议（可选）
 */
export class ModuleCheckEntry {
  public constructor(
    public readonly level: ModuleCheckEntryLevel,
    public readonly code: string,
    public readonly message: string,
    public readonly hint?: string,
  ) {}

  /** 工厂：error 级（导致操作失败） */
  public static error(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('error', code, message, hint)
  }

  /** 工厂：warn 级（成功但有风险） */
  public static warn(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('warn', code, message, hint)
  }

  /** 工厂：info 级（纯信息） */
  public static info(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('info', code, message, hint)
  }
}

/* -------------------------------------------------------------------------------
 * 二、操作结果
 * -------------------------------------------------------------------------------
 * ModuleOperationResult<TData> 是泛型结果容器：
 *   - TData=void   → setAttribute 等无数据返回的操作
 *   - TData=LlmJsonValue → getAttribute / invokeAction 等
 *   - TData=readonly ModuleInstanceRef[] → listChildren / findInstance
 *
 * 关键约束：
 *   · fail() 要求至少一条 check（保证失败有诊断信息）
 *   · failCode() 是 fail([error(code, msg, hint)]) 的简写
 *   · passthroughFailure() 透传上游 result 的 checks + state
 * ----------------------------------------------------------------------------- */

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

  /** 成功结果（可选 data + checks + state） */
  public static ok<TData>(
    data?: TData,
    checks?: readonly ModuleCheckEntry[],
    state?: Record<string, unknown>,
  ): ModuleOperationResult<TData> {
    return new ModuleOperationResult({ ok: true, data, checks, state })
  }

  /** 失败结果（至少一条 check） */
  public static fail(
    checks: readonly ModuleCheckEntry[],
    state?: Record<string, unknown>,
  ): ModuleOperationResult<never> {
    if (checks.length === 0) {
      throw new Error('ModuleOperationResult.fail requires at least one ModuleCheckEntry')
    }
    return new ModuleOperationResult({ ok: false, checks, state })
  }

  /** 失败结果简写：单条 error 级 check */
  public static failCode(code: string, message: string, hint?: string): ModuleOperationResult<never> {
    return ModuleOperationResult.fail([ModuleCheckEntry.error(code, message, hint)])
  }

  /** 透传上游失败（保留原始 checks + state） */
  public static passthroughFailure(result: ModuleOperationResult<unknown>): ModuleOperationResult<never> {
    return new ModuleOperationResult({ ok: false, checks: result.checks, state: result.state })
  }
}

/* -------------------------------------------------------------------------------
 * 三、内部辅助
 * ----------------------------------------------------------------------------- */

/** 空数组视为 undefined（避免返回 [] 语义混淆） */
function nonEmptyChecks(checks: readonly ModuleCheckEntry[] | undefined): readonly ModuleCheckEntry[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}
