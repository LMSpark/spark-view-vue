import type { ComponentConfig, ComponentRegistry } from '../types/spark-component.js'

export type ComponentResolver = (type: string) => unknown | null

// Minimal renderer helper used in tests
export class SparkComponentRendererImpl {
  shouldUpdateComponent(oldCfg: ComponentConfig | null | undefined, newCfg: ComponentConfig | null | undefined): boolean {
    if (oldCfg === newCfg) return false
    if (!oldCfg || !newCfg) return true
    if (oldCfg.type !== newCfg.type) return true
    // shallow props comparison
    const oldProps = (oldCfg as Record<string, unknown>)['props'] || {}
    const newProps = (newCfg as Record<string, unknown>)['props'] || {}
    if (Object.keys(oldProps).length !== Object.keys(newProps).length) return true
    for (const k of Object.keys(oldProps)) if ((oldProps as Record<string, unknown>)[k] !== (newProps as Record<string, unknown>)[k]) return true
    return false
  }

  haveChildrenChanged(oldChildren: Array<ComponentConfig>, newChildren: Array<ComponentConfig>) {
    if (oldChildren.length !== newChildren.length) return true
    for (let i = 0; i < oldChildren.length; i++) {
      const a = oldChildren[i]!
      const b = newChildren[i]!
      if (a.type !== b.type) return true
      const pa = (a as Record<string, unknown>)['props'] || {}
      const pb = (b as Record<string, unknown>)['props'] || {}
      if (Object.keys(pa).length !== Object.keys(pb).length) return true
      for (const k of Object.keys(pa)) if ((pa as Record<string, unknown>)[k] !== (pb as Record<string, unknown>)[k]) return true
    }
    return false
  }

  /**
   * Resolve a renderer implementation for the given config using the provided resolver.
   * Returns the resolved renderer or null when no renderer is available.
   */
  static resolveRendererForConfig(cfg: ComponentConfig, resolver: ComponentResolver) {
    if (!cfg || !cfg.type) return null
    return resolver(cfg.type) ?? null
  }

  /**
   * Create a resolver function that queries a ComponentRegistry instance.
   */
  static createResolverFromRegistry(registry: ComponentRegistry): ComponentResolver {
    return (type: string) => {
      const def = registry.get(type)
      return def?.component ?? null
    }
  }

  /**
   * Check whether a type is registered in the registry.
   */
  static isTypeRegistered(registry: ComponentRegistry, type: string): boolean {
    return registry.has(type)
  }

  /**
   * Return the children array for a config (empty array when none).
   */
  static getChildrenForConfig(cfg: ComponentConfig): Array<ComponentConfig> {
    return Array.isArray(cfg.children) ? cfg.children : []
  }
}
