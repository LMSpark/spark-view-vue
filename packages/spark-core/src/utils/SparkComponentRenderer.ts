import type { ComponentConfig, ComponentRegistry } from '../types/spark-component.js'

export type ComponentResolver = (type: string) => unknown | null

export type RenderResult = {
  type: 'vue-component' | 'native-element' | 'text' | 'fragment'
  component?: any
  props?: Record<string, unknown>
  children?: RenderResult[]
  text?: string
}

/**
 * Unified recursive renderer for Spark components.
 * Handles component tree rendering with proper recursion and optimization.
 */
export class SparkComponentRendererImpl {
  private registry: ComponentRegistry
  private resolver: ComponentResolver

  constructor(registry: ComponentRegistry) {
    this.registry = registry
    this.resolver = (type: string) => {
      const def = this.registry.get(type)
      return def?.component ?? null
    }
  }

  /**
   * Check if component should update based on config changes
   */
  shouldUpdateComponent(oldCfg: ComponentConfig | null | undefined, newCfg: ComponentConfig | null | undefined): boolean {
    if (oldCfg === newCfg) return false
    if (!oldCfg || !newCfg) return true
    if (oldCfg.type !== newCfg.type) return true

    // Shallow props comparison
    const oldProps = oldCfg.props || {}
    const newProps = newCfg.props || {}
    if (Object.keys(oldProps).length !== Object.keys(newProps).length) return true
    for (const k of Object.keys(oldProps)) {
      if (oldProps[k] !== newProps[k]) return true
    }

    return false
  }

  /**
   * Check if children have changed
   */
  haveChildrenChanged(oldChildren: ComponentConfig[], newChildren: ComponentConfig[]): boolean {
    if (oldChildren.length !== newChildren.length) return true
    for (let i = 0; i < oldChildren.length; i++) {
      if (this.shouldUpdateComponent(oldChildren[i], newChildren[i])) return true
    }
    return false
  }

  /**
   * Recursively render a component config into a render result tree
   */
  renderComponentTree(config: ComponentConfig): RenderResult {
    const component = this.resolver(config.type)
    
    const children = this.getChildrenForConfig(config)
    const renderedChildren = children.map(child => this.renderComponentTree(child))

    // If component is registered, render it normally
    if (component) {
      const result: RenderResult = {
        type: 'vue-component',
        component,
        props: {
          config,
          key: config.id || `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
        }
      }

      if (renderedChildren.length > 0) {
        result.children = renderedChildren
      }

      return result
    }
    
    // If no component registered but has children, create a fragment/logical component
    if (renderedChildren.length > 0) {
      return {
        type: 'fragment',
        children: renderedChildren
      }
    }
    
    // If component is null (logical component) but type is registered, create empty fragment
    if (this.registry.has(config.type)) {
      return {
        type: 'fragment',
        children: []
      }
    }
    
    // If no component and no children, this is an error case
    throw new Error(`Component type '${config.type}' is not registered and has no children to render`)
  }

  /**
   * Render a single component (non-recursive)
   */
  renderComponent(config: ComponentConfig): RenderResult {
    const component = this.resolver(config.type)
    if (!component) {
      throw new Error(`Component type '${config.type}' is not registered`)
    }

    return {
      type: 'vue-component',
      component,
      props: {
        config,
        key: config.id || `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
      }
    }
  }

  /**
   * Get children configs for a component config
   */
  getChildrenForConfig(config: ComponentConfig): ComponentConfig[] {
    return Array.isArray(config.children) ? config.children : []
  }

  /**
   * Check if a component type is registered
   */
  isComponentRegistered(type: string): boolean {
    return this.registry.has(type)
  }

  /**
   * Get all registered component types
   */
  getRegisteredTypes(): string[] {
    return this.registry.getAllTypes()
  }
}

// Static utility methods for backward compatibility
export class SparkComponentRenderer {
  /**
   * Check if component should update
   */
  static shouldUpdateComponent(oldCfg: ComponentConfig | null | undefined, newCfg: ComponentConfig | null | undefined): boolean {
    const renderer = new SparkComponentRendererImpl({} as ComponentRegistry)
    return renderer.shouldUpdateComponent(oldCfg, newCfg)
  }

  /**
   * Check if children have changed
   */
  static haveChildrenChanged(oldChildren: ComponentConfig[], newChildren: ComponentConfig[]): boolean {
    const renderer = new SparkComponentRendererImpl({} as ComponentRegistry)
    return renderer.haveChildrenChanged(oldChildren, newChildren)
  }

  /**
   * Resolve a renderer for config
   */
  static resolveRendererForConfig(config: ComponentConfig, resolver: ComponentResolver): unknown | null {
    if (!config || !config.type) return null
    return resolver(config.type) ?? null
  }

  /**
   * Create resolver from registry
   */
  static createResolverFromRegistry(registry: ComponentRegistry): ComponentResolver {
    return (type: string) => {
      const def = registry.get(type)
      return def?.component ?? null
    }
  }

  /**
   * Check if type is registered
   */
  static isTypeRegistered(registry: ComponentRegistry, type: string): boolean {
    return registry.has(type)
  }

  /**
   * Get children for config
   */
  static getChildrenForConfig(config: ComponentConfig): ComponentConfig[] {
    return Array.isArray(config.children) ? config.children : []
  }
}
