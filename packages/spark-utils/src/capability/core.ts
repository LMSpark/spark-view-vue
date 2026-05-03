/**
 * Spark 能力系统核心 —— 框架无关的原语。
 *
 * 本模块刻意保持对 UI、DOM、路由、数据层的零依赖。
 * 提供能力键类型、上下文树定义，以及 provide / consume 原语。
 */

// ==================== 类型定义 ====================

/** 带有幻影类型参数的能力键（编译期类型安全，运行时为 Symbol）。 */
export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }

/** 未具体化类型的能力名（用于 Map 的 key）。 */
export type CapabilityName = CapabilityKey<unknown>

/** 能力消费函数签名：给定键返回实现或 null。 */
export type SparkCapabilityConsumer = <T>(name: CapabilityKey<T>) => T | null

/**
 * 能力类型映射表（模块增强入口）。
 *
 * 各包通过 `declare module '@spark-view/spark-utils' { interface CapabilityTypeMap { ... } }`
 * 扩展此接口，实现编译期的能力类型安全。
 */
export interface CapabilityTypeMap {}

/** 能力树节点：持有本地能力 Map，以及指向父节点的可选链。 */
export interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  capabilities: Map<CapabilityName, unknown>
}

// ==================== 原语函数 ====================

/**
 * 创建一个全局唯一的能力键。
 * 使用 `Symbol.for(name)` 保证跨模块共享同一键实例。
 */
export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

/** 向上下文本地 capabilities map 写入实现。 */
export function sparkProvide<T>(ctx: ICapabilityContext, name: CapabilityKey<T>, impl: T): void {
  ctx.capabilities.set(name, impl)
}

/** 从上下文本地 capabilities map 删除能力键。 */
export function sparkRemove(ctx: ICapabilityContext, name: CapabilityKey<unknown>): void {
  ctx.capabilities.delete(name)
}

/** 沿父链向上查找能力实现，找不到返回 null。 */
export function sparkConsume<T>(ctx: ICapabilityContext, name: CapabilityKey<T>): T | null {
  let current: ICapabilityContext | undefined = ctx
  while (current) {
    const impl = current.capabilities.get(name)
    if (impl !== undefined) return impl as T
    current = current.parent
  }
  return null
}

/** 创建一个新的能力上下文节点，可选挂接父节点。 */
export function createSparkCapabilityContext(
  config: { id: string; type: string },
  parent?: ICapabilityContext | null,
): ICapabilityContext {
  const context: ICapabilityContext = {
    id: config.id,
    type: config.type,
    capabilities: new Map<CapabilityName, unknown>(),
  }
  if (parent !== undefined && parent !== null) {
    context.parent = parent
  }
  return context
}

/** 允许 ctx 为 null/undefined 的安全版 sparkConsume。 */
export function consumeSparkCapability<T>(
  context: ICapabilityContext | null | undefined,
  name: CapabilityKey<T>,
): T | null {
  if (!context) return null
  return sparkConsume(context, name)
}

/** 创建绑定到指定上下文的消费函数（闭包形式）。 */
export function createSparkCapabilityConsumer(
  context: ICapabilityContext | null,
): SparkCapabilityConsumer {
  return <T>(name: CapabilityKey<T>): T | null => consumeSparkCapability(context, name)
}

/** 仅读取本层 capabilities map 中指定键，不向上查找。 */
export function getSparkCapabilityProvider(
  context: ICapabilityContext,
  name: CapabilityKey<unknown>,
): unknown {
  return context.capabilities.get(name)
}
