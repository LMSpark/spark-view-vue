// Note: Logger 系统本身需要使用 console 输出日志，禁用 no-console 规则是合理的
/* eslint-disable no-console */

/**
 * SPARK Logger - 轻量级结构化日志
 *
 * 支持两种消费方式：
 * 1. **全局传输器**（推荐）：`addLogTransport(transport)` — 结构化接收 `(level, message, meta?)`
 * 2. **全局钩子**（旧版桥接）：`setLoggerHook(hook)` — 原始接收 `(level, prefix, args[])`
 *
 * 传输器由应用层（main.ts）注入，所有 `Logger()` 实例的输出自动流入传输器链，
 * 实现 spark-utils → spark-app → AI 闭环的 **全链路贯穿**。
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

// ─── 全局传输器（结构化，APP 层贯穿） ────────────────────────────────────────

/**
 * 日志传输器接口（与 spark-app LogTransport 结构兼容）
 *
 * spark-utils 是最底层包，此接口定义为传输器的基础契约。
 * spark-app 的 LogTransport 扩展了 `flush?()` / `destroy?()`，但 send 签名一致，
 * 因此同一个 transport 实例可同时注册到两个系统。
 */
export interface LogTransport {
  send(level: LogLevel, message: string, meta?: Record<string, unknown>): void | Promise<void>
}

/** 全局传输器列表 */
const _transports: LogTransport[] = []

/**
 * 添加全局传输器。所有通过 `Logger()` 创建的实例在输出控制台后，
 * 会将结构化的 `(level, message, meta)` 发送到每个传输器。
 *
 * 典型用途：AI 闭环日志收集、远程日志上报。
 */
export function addLogTransport(transport: LogTransport): void {
  _transports.push(transport)
}

/**
 * 移除指定传输器
 */
export function removeLogTransport(transport: LogTransport): void {
  const idx = _transports.indexOf(transport)
  if (idx >= 0) _transports.splice(idx, 1)
}

/**
 * 清除所有传输器（测试用）
 */
export function clearLogTransports(): void {
  _transports.length = 0
}

/**
 * 从 Logger 的变长参数中提取结构化的 message + meta
 *
 * 约定：
 * - string 参数 → 拼入 message
 * - Error 对象 → 转为 `{ error, stack }` 合并到 meta
 * - 普通 object → 合并到 meta（如 `{ fileName, error: msg }` ）
 * - 其他类型 → String 化后拼入 message
 */
export function parseLogArgs(prefix: string | undefined, args: unknown[]): { message: string; meta: Record<string, unknown> | undefined } {
  const strings: string[] = prefix !== undefined ? [prefix] : []
  let meta: Record<string, unknown> | undefined

  for (const a of args) {
    if (typeof a === 'string') {
      strings.push(a)
    } else if (a instanceof Error) {
      meta = { ...meta, error: a.message, stack: a.stack }
    } else if (a !== null && a !== undefined && typeof a === 'object') {
      meta = { ...meta, ...(a as Record<string, unknown>) }
    } else if (a !== undefined) {
      strings.push(String(a))
    }
  }

  return { message: strings.join(' '), meta }
}

// ─── 全局钩子（旧版桥接，向后兼容） ───────────────────────────────────────────

/**
 * 全局日志钩子签名
 *
 * 应用层（main.ts）通过 `setLoggerHook()` 注入，
 * 所有 spark-utils `Logger()` 创建的实例在输出控制台后都会调用此钩子。
 *
 * @param level  日志级别
 * @param prefix 创建 Logger 时传入的标签前缀（如 `'[PageRenderer]'`）
 * @param args   原始参数
 *
 * @deprecated 优先使用 `addLogTransport()` 获取结构化输出
 */
export type LoggerHook = (level: LogLevel, prefix: string | undefined, args: unknown[]) => void

/** 全局钩子（默认无） */
let _globalHook: LoggerHook | null = null

/**
 * 注入全局日志钩子。所有通过 `Logger(prefix)` 创建的实例都会在输出控制台后
 * 调用此钩子，应用层可据此将日志转发到远程传输器。
 *
 * 调用多次时后者覆盖前者。传 `null` 移除钩子。
 *
 * @deprecated 优先使用 `addLogTransport()` 获取结构化输出
 */
export function setLoggerHook(hook: LoggerHook | null): void {
  _globalHook = hook
}

// ─── Logger 工厂 ───────────────────────────────────────────────────────────

/** 上下文形状（兼容 ICapabilityContext） */
interface CapabilityHolder {
  capabilities: Map<string | symbol, unknown>
}

function consoleLogger(prefix?: string): LoggerApi {
  const fmt = (level: LogLevel, args: unknown[]) =>
    [`[${new Date().toISOString()}]`, `[${level.toUpperCase()}]`, ...(prefix ? [prefix, ...args] : args)]

  function withHook(level: LogLevel, consoleFn: (...a: unknown[]) => void, args: unknown[]): void {
    consoleFn(...fmt(level, args))

    // 结构化传输器（推荐路径：APP 层贯穿）
    if (_transports.length > 0) {
      const { message, meta } = parseLogArgs(prefix, args)
      for (const t of _transports) {
        try { void t.send(level, message, meta) } catch { /* transport 异常不影响日志输出 */ }
      }
    }

    // 旧版钩子（向后兼容）
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