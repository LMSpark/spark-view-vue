import type { ComponentConfig } from '../types/spark-component.js'
import type { ComponentRegistry } from '../types/spark-component.js'

export type ComponentResolver = (type: string) => unknown | null

/**
 * Resolve a renderer implementation for the given config using the provided resolver.
 * Returns the resolved renderer or null when no renderer is available.
 */
export function resolveRendererForConfig(cfg: ComponentConfig, resolver: ComponentResolver) {
  if (!cfg || !cfg.type) return null
  return resolver(cfg.type) ?? null
}

/**
 * Create a resolver function that queries a ComponentRegistry instance.
 */
export function createResolverFromRegistry(registry: ComponentRegistry): ComponentResolver {
  return (type: string) => {
    const def = registry.get(type)
    return def?.component ?? null
  }
}

/**
 * Check whether a type is registered in the registry.
 */
export function isTypeRegistered(registry: ComponentRegistry, type: string): boolean {
  return registry.has(type)
}

/**
 * Return the children array for a config (empty array when none).
 */
export function getChildrenForConfig(cfg: ComponentConfig): Array<ComponentConfig> {
  return Array.isArray(cfg.children) ? cfg.children : []
}
