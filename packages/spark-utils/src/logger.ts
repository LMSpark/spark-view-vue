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

/** 上下文形状（兼容 ICapabilityContext） */
interface CapabilityHolder {
  capabilities: Map<string | symbol, unknown>
}

function consoleLogger(prefix?: string): LoggerApi {
  const fmt = (level: LogLevel, args: unknown[]) =>
    [`[${new Date().toISOString()}]`, `[${level.toUpperCase()}]`, ...(prefix ? [prefix, ...args] : args)]
  return {
    debug: (...a) => console.debug(...fmt('debug', a)),
    info:  (...a) => console.info(...fmt('info', a)),
    warn:  (...a) => console.warn(...fmt('warn', a)),
    error: (...a) => console.error(...fmt('error', a)),
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
  const raw = context.capabilities?.get(Symbol.for('spark:capability:logger'))
  const impl = raw && typeof raw === 'object' && 'info' in raw ? raw as Partial<LoggerApi> : undefined
  if (!impl) return consoleLogger()

  const fb = consoleLogger()
  return {
    debug: impl.debug?.bind(impl) ?? fb.debug,
    info:  impl.info?.bind(impl)  ?? fb.info,
    warn:  impl.warn?.bind(impl)  ?? fb.warn,
    error: impl.error?.bind(impl) ?? fb.error,
  }
}