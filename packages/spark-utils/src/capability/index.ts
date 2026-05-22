/**
 * Spark 能力系统 —— 统一导出入口。
 *
 * 包含两个层次：
 * - core     框架无关的类型定义与原语函数（defineCapability / sparkProvide 等）
 * - helpers  纯能力树遍历工具（sparkFindNearestProvider 等）
 *
 * 注：运行时上下文锚点（WeakMap owner / pageRoot）已迁移至 spark-component。
 */

export {
  CapabilityKey,
  consumeSparkCapability,
  createSparkCapabilityConsumer,
  createSparkCapabilityContext,
  defineCapability,
  getSparkCapabilityProvider,
  sparkConsume,
  sparkProvide,
  sparkRemove,
} from './core.js'

export type {
  CapabilityContext,
  CapabilityName,
  CapabilityReader,
  CapabilityTypeMap,
  SparkCapabilityConsumer,
} from './core.js'

export {
  sparkConsumeFromProvider,
  sparkFindNearestProvider,
  sparkFindNearestProviderByKeys,
} from './helpers.js'
