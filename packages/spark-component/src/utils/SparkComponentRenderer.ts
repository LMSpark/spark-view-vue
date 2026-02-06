import type { ComponentInstance, ComponentRegistry } from '../types/spark-component.js'
import type { Component } from 'vue'

/**
 * 组件解析器函数类型
 * 
 * 负责将组件类型名称解析为实际的 Vue 组件
 * 
 * @param type - 组件类型名称（如 'spark-button'）
 * @returns Vue 组件或 null（未找到）
 */
export type ComponentResolver = (type: string) => unknown | null

/**
 * 渲染结果类型
 * 
 * 表示组件树的渲染结果，可以是：
 * - vue-component: Vue 组件
 * - native-element: 原生 HTML 元素
 * - text: 文本节点
 * - fragment: 片段（多个子节点）
 */
export type RenderResult = {
  /** 渲染结果类型 */
  type: 'vue-component' | 'native-element' | 'text' | 'fragment'
  /** Vue 组件（仅 vue-component 类型） */
  component?: Component
  /** 组件属性 */
  props?: Record<string, unknown>
  /** 子节点渲染结果 */
  children?: RenderResult[]
  /** 文本内容（仅 text 类型） */
  text?: string
}

/**
 * SPARK 组件渲染器实现
 * 
 * 核心职责：将组件实例配置转换为可渲染的 VNode 结构
 * - 解析组件类型到 Vue 组件（查 Registry）
 * - 递归渲染组件树
 * - 优化渲染性能（shouldUpdate 检测）
 * - 处理逻辑组件（无 Vue 组件但有子组件）
 * 
 * 设计特点：
 * - 统一的递归渲染算法
 * - 支持组件树和单组件渲染
 * - 浅比较优化更新检测
 * 
 * 与其他组件的关系：
 * - 依赖 Registry 查找组件定义
 * - 被 Manager 调用执行渲染
 */
export class SparkComponentRendererImpl {
  /** 组件注册表（用于查找组件定义） */
  private registry: ComponentRegistry
  /** 组件解析器（将类型名解析为 Vue 组件） */
  private resolver: ComponentResolver

  /**
   * 构造函数
   * 
   * @param registry - 组件注册表实例
   */
  constructor(registry: ComponentRegistry) {
    this.registry = registry
    this.resolver = (type: string) => {
      const def = this.registry.get(type)
      return def?.component ?? null
    }
  }

  /**
   * 检查组件是否应该更新
   * 
   * 通过浅比较判断组件实例配置是否发生变化，用于优化渲染性能
   * 
   * 比较规则：
   * 1. 引用相同 → 不更新
   * 2. 有一个为空 → 更新
   * 3. 类型不同 → 更新
   * 4. 属性数量不同 → 更新
   * 5. 属性值不同（浅比较）→ 更新
   * 
   * @param oldCfg - 旧实例配置
   * @param newCfg - 新实例配置
   * @returns 是否应该更新
   */
  shouldUpdateComponent(oldCfg: ComponentInstance | null | undefined, newCfg: ComponentInstance | null | undefined): boolean {
    if (oldCfg === newCfg) return false
    if (!oldCfg || !newCfg) return true
    if (oldCfg.type !== newCfg.type) return true

    // Shallow props comparison
    const oldProps = oldCfg.props ?? {}
    const newProps = newCfg.props ?? {}
    if (Object.keys(oldProps).length !== Object.keys(newProps).length) return true
    for (const k of Object.keys(oldProps)) {
      if (oldProps[k] !== newProps[k]) return true
    }

    return false
  }

  /**
   * 检查子组件是否发生变化
   * 
   * @param oldChildren - 旧子组件数组
   * @param newChildren - 新子组件数组
   * @returns 是否发生变化
   */
  haveChildrenChanged(oldChildren: ComponentInstance[], newChildren: ComponentInstance[]): boolean {
    if (oldChildren.length !== newChildren.length) return true
    for (let i = 0; i < oldChildren.length; i++) {
      if (this.shouldUpdateComponent(oldChildren[i], newChildren[i])) return true
    }
    return false
  }

  /**
   * 递归渲染组件树
   * 
   * 将组件实例配置树转换为渲染结果树，支持：
   * - 标准组件（有 Vue 组件定义）
   * - 逻辑组件（仅有子组件，无 Vue 组件）
   * - 空片段（已注册但无内容）
   * 
   * @param instance - 组件实例配置
   * @returns 渲染结果树
   * @throws 如果组件类型未注册且无子组件
   * 
   * @example
   * ```typescript
   * const result = renderer.renderComponentTree({
   *   type: 'spark-grid',
   *   props: { dataSource: [] },
   *   children: [
   *     { type: 'spark-column', props: { field: 'name' } }
   *   ]
   * })
   * ```
   */
  renderComponentTree(instance: ComponentInstance): RenderResult {
    const component = this.resolver(instance.type)
    
    const children = this.getChildrenForConfig(instance)
    const renderedChildren = children.map(child => this.renderComponentTree(child))

    // If component is registered, render it normally
    if (component) {
      const result: RenderResult = {
        type: 'vue-component',
        component,
        props: {
          instance,
          key: instance.id ?? `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
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
    if (this.registry.has(instance.type)) {
      return {
        type: 'fragment',
        children: []
      }
    }
    
    // If no component and no children, this is an error case
    throw new Error(`Component type '${instance.type}' is not registered and has no children to render`)
  }

  /**
   * 渲染单个组件（非递归）
   * 
   * 仅渲染指定组件本身，不处理子组件
   * 
   * @param instance - 组件实例配置
   * @returns 渲染结果
   * @throws 如果组件类型未注册
   */
  renderComponent(instance: ComponentInstance): RenderResult {
    const component = this.resolver(instance.type)
    if (!component) {
      throw new Error(`Component type '${instance.type}' is not registered`)
    }

    return {
      type: 'vue-component',
      component,
      props: {
        instance,
        key: instance.id ?? `spark-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
      }
    }
  }

  /**
   * 获取组件实例的子组件列表
   * 
   * @param instance - 组件实例配置
   * @returns 子组件实例数组（空数组如果无子组件）
   */
  getChildrenForConfig(instance: ComponentInstance): ComponentInstance[] {
    return Array.isArray(instance.children) ? instance.children : []
  }

  /**
   * 检查组件类型是否已注册
   * 
   * @param type - 组件类型名称
   * @returns 是否已注册
   */
  isComponentRegistered(type: string): boolean {
    return this.registry.has(type)
  }

  /**
   * 获取所有已注册的组件类型
   * 
   * @returns 组件类型名称数组
   */
  getRegisteredTypes(): string[] {
    return this.registry.getAllTypes()
  }
}

/**
 * SPARK 组件渲染器静态工具类
 * 
 * 提供向后兼容的静态方法，无需创建 Renderer 实例
 * 
 * 注意：这些方法主要用于向后兼容，新代码应优先使用 SparkComponentRendererImpl 实例
 */
export class SparkComponentRenderer {
  /**
   *  检查组件是否应该更新（静态方法）
   * 
   * @param oldCfg - 旧实例配置
   * @param newCfg - 新实例配置
   * @returns 是否应该更新
   */
  static shouldUpdateComponent(oldCfg: ComponentInstance | null | undefined, newCfg: ComponentInstance | null | undefined): boolean {
    const renderer = new SparkComponentRendererImpl({} as ComponentRegistry)
    return renderer.shouldUpdateComponent(oldCfg, newCfg)
  }

  /**
   * 检查子组件是否发生变化（静态方法）
   * 
   * @param oldChildren - 旧子组件数组
   * @param newChildren - 新子组件数组
   * @returns 是否发生变化
   */
  static haveChildrenChanged(oldChildren: ComponentInstance[], newChildren: ComponentInstance[]): boolean {
    const renderer = new SparkComponentRendererImpl({} as ComponentRegistry)
    return renderer.haveChildrenChanged(oldChildren, newChildren)
  }

  /**
   * 解析组件实例对应的渲染器
   * 
   * @param instance - 组件实例配置
   * @param resolver - 组件解析器
   * @returns 解析的组件或 null
   */
  static resolveRendererForConfig(instance: ComponentInstance, resolver: ComponentResolver): unknown | null {
    if (!instance?.type) return null
    return resolver(instance.type) ?? null
  }

  /**
   * 从注册表创建组件解析器
   * 
   * @param registry - 组件注册表
   * @returns 组件解析器函数
   * 
   * @example
   * ```typescript
   * const resolver = SparkComponentRenderer.createResolverFromRegistry(registry)
   * const component = resolver('spark-button')
   * ```
   */
  static createResolverFromRegistry(registry: ComponentRegistry): ComponentResolver {
    return (type: string) => {
      const def = registry.get(type)
      return def?.component ?? null
    }
  }

  /**
   * 检查类型是否已注册（静态方法）
   * 
   * @param registry - 组件注册表
   * @param type - 组件类型名称
   * @returns 是否已注册
   */
  static isTypeRegistered(registry: ComponentRegistry, type: string): boolean {
    return registry.has(type)
  }

  /**
   * 获取实例的子组件（静态方法）
   * 
   * @param instance - 组件实例配置
   * @returns 子组件实例数组
   */
  static getChildrenForConfig(instance: ComponentInstance): ComponentInstance[] {
    return Array.isArray(instance.children) ? instance.children : []
  }
}
