/**
 * module-semantic · 操作结果原语
 *
 * 协议层级：第 1 层（最底层，无协议内依赖）
 * 核心职责：定义统一的"操作结果"容器和诊断条目，所有协议操作均通过它返回。
 * 上游依赖：无（仅依赖 TypeScript 标准库）
 * 下游消费：module-context、module-kind、以及所有调用协议方法的消费方
 *
 * 设计思路：
 *   借鉴 Rust Result 模式，但保留多级诊断（checks 数组）以适配 LLM 纠错场景。
 *   ok=true  → 操作成功，可选 data + info/warn 级 checks（LLM 可见的提示）
 *   ok=false → 操作失败，至少一条 error 级 check（code + message + hint）
 *
 * 三层诊断：
 *   error — 导致操作失败的根本原因，必须附带修复建议 hint
 *   warn  — 操作成功但存在值得关注的问题（如性能退化、配置不推荐）
 *   info  — 纯信息性提示（如"操作已完成，共处理 N 条记录"）
 *
 * 文件结构（按时序：从最小诊断单元 → 泛型结果容器 → 内部辅助）：
 *   一、诊断条目 — ModuleCheckEntry
 *   二、操作结果 — ModuleOperationResult<TData>
 *   三、内部辅助
 */

// ============================================================================
// 一、诊断条目 — ModuleCheckEntry
//
// 操作结果的最小诊断单元。每条 check 包含：
//   level   — 严重级别（error / warn / info）
//   code    — 错误码（机器可读，如 "ATTRIBUTE_NOT_DECLARED"）
//   message — 人类可读描述
//   hint    — 修复建议（可选，LLM 在失败后可参考的恢复步骤）
//
// 构造通过静态工厂方法，不直接使用 new，保证语义清晰。
// ============================================================================

/** 诊断级别：error（终止）/ warn（提醒）/ info（告知） */
export type ModuleCheckEntryLevel = 'error' | 'warn' | 'info'

export class ModuleCheckEntry {
  /**
   * level — 严重级别（error / warn / info）
   * code  — 错误码（机器可读）
   * message — 人类可读描述
   * hint  — 修复建议（可选）
   */
  public constructor(
    public readonly level: ModuleCheckEntryLevel,
    public readonly code: string,
    public readonly message: string,
    public readonly hint?: string,
  ) {}

  /** error 级：导致操作失败的根本原因。hint 建议必填。 */
  public static error(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('error', code, message, hint)
  }

  /** warn 级：操作成功但存在值得关注的问题。不阻断流程，但提示 LLM 注意。 */
  public static warn(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('warn', code, message, hint)
  }

  /** info 级：纯信息性提示。告知 LLM 操作上下文，不影响决策。 */
  public static info(code: string, message: string, hint?: string): ModuleCheckEntry {
    return new ModuleCheckEntry('info', code, message, hint)
  }
}

// ============================================================================
// 二、操作结果 — ModuleOperationResult<TData>
//
// 泛型结果容器，所有协议操作的统一返回类型。
//
// 泛型参数约定：
//   TData=void                          → setAttribute（无返回值）
//   TData=LlmJsonValue                  → getAttribute / 业务函数调用
//   TData=readonly ModuleInstanceRef[]  → listChildren / findInstance
//
// 关键约束：
//   fail() 要求至少一条 check，杜绝"沉默失败"
//   failCode() 是 fail([error(code, msg, hint)]) 的简写，覆盖最常见的单错误场景
//   passthroughFailure() 透传上游 checks + state，保留完整错误链不截断
//
// 构造流程：ModuleOperationResultOptions → 构造函数（自动过滤空 checks） → 实例
// ============================================================================

export type ModuleOperationResultOptions<TData> = Readonly<{
  ok: boolean
  data?: TData
  checks?: readonly ModuleCheckEntry[]
  state?: Record<string, unknown>
}>

export class ModuleOperationResult<TData = unknown> {
  /** 操作是否成功 */
  public readonly ok: boolean
  /** 成功时的业务数据（失败时为 undefined） */
  public readonly data?: TData
  /** 诊断条目列表（失败时至少含一条 error；空数组等价于 undefined） */
  public readonly checks?: readonly ModuleCheckEntry[]
  /** 附加状态数据（透传用，如请求 ID、时间戳等） */
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

  /** 成功结果。data 可选（void 操作不需要），checks 仅允许 info/warn 级别。 */
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

  /**
   * 失败结果。必须至少提供一条 check，杜绝"无理由失败"。
   * 抛出异常 (fail-fast)：调用方不应传入空数组。
   */
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

  /** 失败简写：自动将 code + message + hint 包装为单条 error 级 check。 */
  public static failCode(code: string, message: string, hint?: string): ModuleOperationResult<never> {
    return ModuleOperationResult.fail([ModuleCheckEntry.error(code, message, hint)])
  }

  /**
   * 透传上游失败结果。保留原始 checks + state，不丢失错误链信息。
   * 典型场景：ModuleKind 协议方法调用委托返回失败时，原样向上传递。
   */
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
//
// 仅在构造函数内部使用，不对外暴露。
// ============================================================================

/** 空数组视为 undefined，避免"有 checks 属性但值为空数组"的歧义。 */
function nonEmptyChecks(checks: readonly ModuleCheckEntry[] | undefined): readonly ModuleCheckEntry[] | undefined {
  return checks === undefined || checks.length === 0 ? undefined : checks
}
