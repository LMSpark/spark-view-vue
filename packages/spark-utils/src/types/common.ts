/**
 * 任意函数类型
 */
export type AnyFunction = (...args: unknown[]) => unknown

/**
 * 能力接口
 * 
 * @description 描述能力的可用成员形状，值通常是函数或表示可用性的布尔标志
 */
export type CapabilityInterface = Record<string, AnyFunction | boolean | unknown>

/**
 * 提供者/消费者携带的实现载荷
 */
export type Implementation = Record<string, unknown>

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * Logger API 接口
 */
export interface LoggerApi {
  /**
   * 调试日志
   * 
   * @param args - 日志参数
   */
  debug: (...args: unknown[]) => void
  
  /**
   * 信息日志
   * 
   * @param args - 日志参数
   */
  info: (...args: unknown[]) => void
  
  /**
   * 警告日志
   * 
   * @param args - 日志参数
   */
  warn: (...args: unknown[]) => void
  
  /**
   * 错误日志
   * 
   * @param args - 日志参数
   */
  error: (...args: unknown[]) => void
}

// 能力类型已移至 @spark-view/spark-utils/capability
// 请从 @spark-view/spark-utils 导入 Provider, Consumer 类型

/**
 * 日志传输器接口
 */
export interface Transport {
  /** 日志级别 */
  level?: LogLevel
  
  /**
   * 日志记录方法
   * 
   * @param level - 日志级别
   * @param message - 日志消息
   * @param meta - 元数据（可选）
   * @returns 可能返回 Promise
   */
  log: (level: LogLevel, message: string, meta?: unknown) => void | Promise<void>
}
