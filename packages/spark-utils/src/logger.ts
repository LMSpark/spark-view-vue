// Note: Logger 系统本身需要使用 console 输出日志，禁用 no-console 规则是合理的
/* eslint-disable no-console */

/**
 * SPARK Logger - 轻量级结构化日志
 */

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Logger API */
export interface LoggerApi {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/**
 * 全局日志钩子签名
 *
 * 应用层（main.ts）通过 `setLoggerHook()` 注入，
 * 所有 spark-utils `Logger()` 创建的实例在输出控制台后都会调用此钩子。
 *
 * @param level  日志级别
 * @param prefix 创建 Logger 时传入的标签前缀（如 `'[PageRenderer]'`）
 * @param args   原始参数
 */
export type LoggerHook = (level: LogLevel, prefix: string | undefined, args: unknown[]) => void

/** 全局钩子（默认无） */
let _globalHook: LoggerHook | null = null

/**
 * 注入全局日志钩子。所有通过 `Logger(prefix)` 创建的实例都会在输出控制台后
 * 调用此钩子，应用层可据此将日志转发到远程传输器。
 *
 * 调用多次时后者覆盖前者。传 `null` 移除钩子。
 */
export function setLoggerHook(hook: LoggerHook | null): void {
  _globalHook = hook
}

/** 上下文形状（兼容 ICapabilityContext） */
interface CapabilityHolder {
  capabilities: Map<string | symbol, unknown>
}

function consoleLogger(prefix?: string): LoggerApi {
  const fmt = (level: LogLevel, args: unknown[]) =>
    [`[${new Date().toISOString()}]`, `[${level.toUpperCase()}]`, ...(prefix ? [prefix, ...args] : args)]

  function withHook(level: LogLevel, consoleFn: (...a: unknown[]) => void, args: unknown[]): void {
    consoleFn(...fmt(level, args))
    if (_globalHook !== null) {
      try { _globalHook(level, prefix, args) } catch { /* 钩子异常不影响日志输出 */ }
    }
  }

  return {
    debug: (...a) => withHook('debug', console.debug, a),
    info:  (...a) => withHook('info',  console.info,  a),
    warn:  (...a) => withHook('warn',  console.warn,  a),
    error: (...a) => withHook('error', console.error, a),
  }
}

/**
 * 创建 Logger
 * @param context 字符串标签 或 含 capabilities Map 的上下文
 */
export function Logger(context?: string | CapabilityHolder): LoggerApi {
  if (typeof context === 'string' || context === undefined) {
    return consoleLogger(context ? `[${context}]` : undefined)
  }

  // LOGGER 能力键经 normalizeKey / defineCapability 存储为 Symbol.for('spark:capability:logger')
  // 直接使用 Symbol.for 匹配，避免引入 symbols 模块的循环依赖风险
  const cap = context.capabilities.get(Symbol.for('spark:capability:logger'))
  const raw = cap !== undefined ? cap : undefined
  const impl = raw !== null && raw !== undefined && typeof raw === 'object' && 'info' in raw ? raw as Partial<LoggerApi> : undefined
  if (impl === undefined) return consoleLogger()

  const fb = consoleLogger()
  return {
    debug: impl.debug?.bind(impl) ?? fb.debug,
    info:  impl.info?.bind(impl)  ?? fb.info,
    warn:  impl.warn?.bind(impl)  ?? fb.warn,
    error: impl.error?.bind(impl) ?? fb.error,
  }
}