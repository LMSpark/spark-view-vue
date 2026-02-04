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

/**
 * 能力提供者
 * 
 * @template TInterface - 接口类型
 * @template TImpl - 实现类型
 */
export interface CapabilityProvider<TInterface = CapabilityInterface, TImpl = Implementation> {
  /** 能力名称 */
  name: string
  
  /** 版本号 */
  version?: string
  
  /** 接口定义 */
  interface?: TInterface
  
  /** 实现细节 */
  implementation?: TImpl
}

/**
 * 能力消费者
 * 
 * @template TInterface - 接口类型
 * @template TImpl - 实现类型
 */
export interface CapabilityConsumer<TInterface = CapabilityInterface, TImpl = Implementation> {
  /** 能力名称 */
  capabilityName: string
  
  /** 接口定义 */
  interface?: TInterface
  
  /** 实现细节 */
  implementation?: TImpl | undefined
  
  /** 最小版本要求 */
  minVersion?: string
  
  /**
   * 提供者就绪回调
   * 
   * @param prov - 能力提供者实例
   */
  onProvide?: (prov: CapabilityProvider<TInterface, TImpl>) => void
}

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
