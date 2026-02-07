// 从 spark-utils 导出日志相关类型
export type { LogLevel, LoggerApi, Transport } from '@spark-view/spark-utils'

// 直接从 spark-utils 导出能力类型（使用新的简化API）
export type {
  Provider as CapabilityProvider,
  Consumer as CapabilityConsumer,
  Context as CapabilityContext
} from '@spark-view/spark-utils'

export type Implementation = Record<string, unknown>