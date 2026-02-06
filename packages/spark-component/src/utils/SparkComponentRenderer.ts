import type { ComponentContext, ComponentRegistry } from '../types/spark-component.js'
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
 * 核心职责：将组件上下文转换为可渲染的 VNode 结构
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
  /** 渲染缓存（优化重复渲染，key: contextId, value: RenderResult） */
  private renderCache = new Map<string, { result: RenderResult; timestamp: number }>()
  /** 缓存过期时间（毫秒，默认 5 分钟） */
  private readonly CACHE_TTL = 5 * 60 * 1000

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
   * 清除渲染缓存
   * 
   * @param contextId - 可选，仅清除指定上下文的缓存；不传则清除所有
   */
  clearCache(contextId?: string): void {
    if (contextId) {
      this.renderCache.delete(contextId)
    } else {
      this.renderCache.clear()
    }
  }

  /**
   * 清除过期缓存（内部维护方法）
   */
  private pruneExpiredCache(): void {
    const now = Date.now()
    for (const [id, cached] of this.renderCache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL) {
        this.renderCache.delete(id)
      }
    }
  }

  /**
   * 检查组件是否应该更新
   * 
   * 通过浅比较判断组件上下文配置是否发生变化，用于优化渲染性能
   * 
   * 比较规则：
   * 1. 引用相同 → 不更新
   * 2. 有一个为空 → 更新
   * 3. 类型不同 → 更新
   * 4. props 数量不同 → 更新
   * 5. props 值不同（浅比较）→ 更新
   * 
   * @param oldCtx - 旧上下文
   * @param newCtx - 新上下文
   * @returns 是否应该更新
   */
  shouldUpdateComponent(oldCtx: ComponentContext | null | undefined, newCtx: ComponentContext | null | undefined): boolean {
    if (oldCtx === newCtx) return false
    if (!oldCtx || !newCtx) return true
    if (oldCtx.type !== newCtx.type) return true

    // Shallow props comparison
    const oldProps = oldCtx.props ?? {}
    const newProps = newCtx.props ?? {}
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
  haveChildrenChanged(oldChildren: ComponentContext[], newChildren: ComponentContext[]): boolean {
    if (oldChildren.length !== newChildren.length) return true
    for (let i = 0; i < oldChildren.length; i++) {
      if (this.shouldUpdateComponent(oldChildren[i], newChildren[i])) return true
    }
    return false
  }

  /**
   * 递归渲染组件树
   * 
   * 将组件上下文树转换为渲染结果树，支持：
   * - 标准组件（有 Vue 组件定义）
   * - 逻辑组件（仅有子组件，无 Vue 组件）
   * - 空片段（已注册但无内容）
   * 
   * @param ctx - 组件上下文
   * @returns 渲染结果树
   * @throws 如果组件类型未注册且无子组件
   * 
   * @example
   * ```typescript
   * const result = renderer.renderComponentTree({
   *   type: 'spark-grid',
   *   props: { dataSource: [] },
   *   children: [
   *     { type: 'spark-column', props: { field: 'name' }, children: [] }
   *   ]
   * })
   * ```
   */
  renderComponentTree(ctx: ComponentContext): RenderResult {
    // 定期清理过期缓存（每次渲染时有 1% 的机会触发）
    if (Math.random() < 0.01) {
      this.pruneExpiredCache()
    }

    const component = this.resolver(ctx.type)
    
    const children = ctx.children ?? []
    const renderedChildren = children.map(child => this.renderComponentTree(child))

    // If component is registered, render it normally
    if (component) {
      const result: RenderResult = {
        type: 'vue-component',
        component,
        props: {
          context: ctx,
          key: ctx.id
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
    if (this.registry.has(ctx.type)) {
      return {
        type: 'fragment',
        children: []
      }
    }
    
    // If no component and no children, this is an error case
    throw new Error(`Component type '${ctx.type}' is not registered and has no children to render`)
  }

  /**
   * 渲染单个组件（非递归）
   * 
   * 仅渲染指定组件本身，不处理子组件
   * 
   * @param ctx - 组件上下文
   * @returns 渲染结果
   * @throws 如果组件类型未注册
   */
  renderComponent(ctx: ComponentContext): RenderResult {
    const component = this.resolver(ctx.type)
    if (!component) {
      throw new Error(`Component type '${ctx.type}' is not registered`)
    }

    return {
      type: 'vue-component',
      component,
      props: {
        context: ctx,
        key: ctx.id
      }
    }
  }

  /**
   * 获取组件上下文的子组件列表
   * 
   * @param ctx - 组件上下文
   * @returns 子组件数组（空数组如果无子组件）
   */
  getChildrenForConfig(ctx: ComponentContext): ComponentContext[] {
    return ctx.children ?? []
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
 * 注意：这些方法主要用于测试和向后兼容，新代码应优先使用 SparkComponentRendererImpl 实例
 */
export class SparkComponentRenderer {
  /**
   * 解析组件上下文对应的渲染器
   * 
   * @param ctx - 组件上下文
   * @param resolver - 组件解析器
   * @returns 解析的组件或 null
   */
  static resolveRendererForConfig(ctx: ComponentContext, resolver: ComponentResolver): unknown | null {
    if (!ctx?.type) return null
    return resolver(ctx.type) ?? null
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

}
