// 从 spark-utils 导出日志相关类型
export type { LogLevel, LoggerApi, Transport } from '@spark-view/spark-utils'

// 直接从 spark-utils 导出能力类型（使用新的简化API）
export type {
  Provider as CapabilityProvider,
  Consumer as CapabilityConsumer,
  Context as CapabilityContext
} from '@spark-view/spark-utils'

// 内部类型（仅供 spark 包系统使用）
export type {
  Connector as CapabilityConnector,
  Manager as CapabilityManager
} from '@spark-view/spark-utils/capability/internal'

export type AnyFunction = (...args: unknown[]) => unknown
export type Implementation = Record<string, unknown>