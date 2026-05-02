/**
 * Framework-agnostic capability core.
 *
 * This module intentionally stays free of UI, DOM, router, and data-layer semantics.
 */

export type CapabilityKey<T> = symbol & { readonly __capabilityType?: T }
export type CapabilityName = CapabilityKey<unknown>
export type SparkCapabilityConsumer = <T>(name: CapabilityKey<T>) => T | null

export interface CapabilityTypeMap {}

export interface ICapabilityContext {
  id: string
  type: string
  parent?: ICapabilityContext
  capabilities: Map<CapabilityName, unknown>
}

export function defineCapability<T>(name: string): CapabilityKey<T> {
  return Symbol.for(name) as CapabilityKey<T>
}

export function sparkProvide<T>(ctx: ICapabilityContext, name: CapabilityKey<T>, impl: T): void {
  ctx.capabilities.set(name, impl)
}

export function sparkRemove(ctx: ICapabilityContext, name: CapabilityKey<unknown>): void {
  ctx.capabilities.delete(name)
}

export function sparkConsume<T>(ctx: ICapabilityContext, name: CapabilityKey<T>): T | null {
  let current: ICapabilityContext | undefined = ctx
  while (current) {
    const impl = current.capabilities.get(name)
    if (impl !== undefined) return impl as T
    current = current.parent
  }
  return null
}

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

export function consumeSparkCapability<T>(
  context: ICapabilityContext | null | undefined,
  name: CapabilityKey<T>,
): T | null {
  if (!context) return null
  return sparkConsume(context, name)
}

export function createSparkCapabilityConsumer(
  context: ICapabilityContext | null,
): SparkCapabilityConsumer {
  return <T>(name: CapabilityKey<T>): T | null => consumeSparkCapability(context, name)
}

export function getSparkCapabilityProvider(
  context: ICapabilityContext,
  name: CapabilityKey<unknown>,
): unknown {
  return context.capabilities.get(name)
}