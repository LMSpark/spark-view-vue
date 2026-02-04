/**
 * 能力系统类型定义
 * 统一使用 @spark-view/spark-utils 提供的通用能力类型
 */

// 导入通用能力类型
import type {
  CapabilityProvider as BaseCapabilityProvider,
  CapabilityConsumer as BaseCapabilityConsumer,
  CapabilityContext as BaseCapabilityContext,
  CapabilityConnector as BaseCapabilityConnector,
  ICapabilityManager
} from '@spark-view/spark-utils'

export type AnyFunction = (...args: unknown[]) => unknown

/**
 * A capability interface describes shape of available members for a capability.
 * Values are typically functions or boolean flags indicating availability.
 */
export type CapabilityInterface = Record<string, AnyFunction | boolean | unknown>

/** Implementation payload carried by providers/consumers */
export type Implementation = Record<string, unknown>

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggerApi {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * 能力提供者（兼容版本）
 * 基于 spark-utils 的类型，添加向后兼容字段
 */
export interface CapabilityProvider<TInterface = CapabilityInterface, TImpl = Implementation> 
  extends Omit<BaseCapabilityProvider<TInterface, TImpl>, 'version' | 'interface'> {
  version?: string  // 可选以保持向后兼容
  interface?: TInterface  // 可选以保持向后兼容
}

/**
 * 能力消费者（兼容版本）
 * 基于 spark-utils 的类型，添加向后兼容字段
 */
export interface CapabilityConsumer<TInterface = CapabilityInterface, TImpl = Implementation>
  extends Omit<BaseCapabilityConsumer<TInterface, TImpl>, 'interface'> {
  interface?: TInterface  // 可选以保持向后兼容
  onProvide?: (prov: CapabilityProvider<TInterface, TImpl>) => void  // 延迟绑定回调
}

/**
 * 能力上下文（直接使用 spark-utils 类型）
 */
export type CapabilityContext = BaseCapabilityContext

/**
 * 能力连接器（直接使用 spark-utils 类型）
 */
export type CapabilityConnector = BaseCapabilityConnector

/**
 * 能力管理器接口（直接使用 spark-utils 类型）
 */
export type { ICapabilityManager }

export interface Transport {
  level?: LogLevel
  log: (level: LogLevel, message: string, meta?: unknown) => void | Promise<void>
}