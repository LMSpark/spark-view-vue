/**
 * 📦 组件实例生命周期管理器
 * 
 * 管理每个组件实例从"出生"到"死亡"：
 * - 创建上下文（Context）→ 组件运行环境
 * - 渲染组件树 → VNode
 * - 连接能力系统 → Provider/Consumer
 * - 销毁上下文 → 清理资源
 * 
 * 不管组件注册（Registry）- 通过 getRegistry() 访问
 */
import { componentRegistry as defaultRegistry, createComponentRegistry } from './SparkComponentRegistry.js'
import { Logger } from '@spark-view/spark-utils'
import { capabilityManager as defaultCapabilityManager, createComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'
import { SparkComponentRendererImpl } from './SparkComponentRenderer.js'
import type { ComponentContext, CapabilityProvider, CapabilityConsumer, ComponentRegistry, ComponentManager } from '../types/spark-component.js'
import type { ComponentCapabilityManager } from '../capability/ComponentCapabilityManager.js'

/**
 * 🎯 组件实例管理器（负责实例的"生老病死"）
 * 
 * 采用树形结构存储 Context（通过 parent/children 关系）
 * rootContexts 存储所有根节点，用于遍历整棵树
 * 
 * @internal 不应直接导入，通过 Spark 命名空间访问
 */
class SparkComponentManagerImpl {
  private readonly rootContexts: ComponentContext[] = []
  private readonly renderer: SparkComponentRendererImpl
  private readonly registry: ComponentRegistry
  private readonly capabilityManager: ComponentCapabilityManager
  private readonly logger = Logger('Spark:Manager')

  constructor(
    renderer?: SparkComponentRendererImpl, 
    registry?: ComponentRegistry,
    capabilityManager?: ComponentCapabilityManager
  ) {
    this.registry = registry ?? defaultRegistry
    this.capabilityManager = capabilityManager ?? defaultCapabilityManager
    this.renderer = renderer ?? new SparkComponentRendererImpl(this.registry)
  }

  // ============================================================================
  // 📦 Context 生命周期：创建 → 查询 → 销毁
  // ============================================================================

  /** 创建组件上下文（组件实例的运行环境） */
  createContext(config: Partial<ComponentContext>, parent?: ComponentContext): ComponentContext {
    // 验证必需字段
    if (!config.type || typeof config.type !== 'string') {
      throw new Error('createContext requires a valid type (non-empty string)')
    }
    if (!this.registry.has(config.type)) {
      this.logger.warn(`Component type '${config.type}' not registered. Register it before rendering.`)
    }

    // 创建上下文
    const ctx: ComponentContext = {
      id: config.id ?? this.generateId(),
      type: config.type,
      props: config.props,
      children: config.children ?? [],
      parent,
      state: config.state ?? {},
      providers: new Map<string, CapabilityProvider>(),
      consumers: new Map<string, CapabilityConsumer>()
    }

    // 建立父子关系
    if (parent) {
      parent.children ??= []
      parent.children.push(ctx)
    } else {
      // 根节点：加入根节点列表
      this.rootContexts.push(ctx)
    }

    this.logger.debug(`Context created: ${ctx.type} (${ctx.id})${parent ? ` [parent: ${parent.id}]` : ' [root]'}`)
    return ctx
  }

  /** 查询上下文（遍历树查找）*/
  getContext(id: string): ComponentContext | undefined {
    for (const root of this.rootContexts) {
      const found = this.findInTree(root, id)
      if (found) return found
    }
    return undefined
  }

  /** 获取所有上下文（遍历树收集）*/
  getAllContexts(): ComponentContext[] {
    const result: ComponentContext[] = []
    for (const root of this.rootContexts) {
      this.walkTree(root, ctx => result.push(ctx))
    }
    return result
  }

  /** 注册上下文到管理器（如果是根节点，添加到 rootContexts）*/
  registerContext(context: ComponentContext): void {
    // 如果没有父节点，说明是根节点，需要添加到 rootContexts
    if (!context.parent) {
      // 检查是否已经在列表中
      if (!this.rootContexts.find(c => c.id === context.id)) {
        this.rootContexts.push(context)
        this.logger.debug(`Root context registered: ${context.type} (${context.id})`)
      }
    } else {
      // 有父节点的 context 已经通过 parent.children 连接到树中
      this.logger.debug(`Context already in tree: ${context.type} (${context.id})`)
    }
  }

  /** 销毁上下文（从树中移除，GC 自动清理）*/
  destroyContext(id: string): boolean {
    const ctx = this.getContext(id)
    if (!ctx) return false

    try {
      // 从父组件或根节点列表移除
      const parent = ctx.parent as ComponentContext | undefined
      if (parent?.children) {
        parent.children = parent.children.filter(c => c.id !== id)
      } else {
        // 根节点：从 rootContexts 移除
        const index = this.rootContexts.findIndex(c => c.id === id)
        if (index !== -1) {
          this.rootContexts.splice(index, 1)
        }
      }
      
      // 移除后，整个子树会被 GC 回收（如果没有外部引用）
      this.logger.debug(`Context destroyed: ${ctx.type} (${id})`)
      return true
    } catch (e) {
      this.logger.error('Failed to destroy context:', e)
      return false
    }
  }

  // ============================================================================
  // 🎨 组件渲染：配置 → VNode
  // ============================================================================

  /** 渲染组件树 */
  render(config: Partial<ComponentContext>, parentContext?: ComponentContext): unknown {
    const ctx = this.createContext(config, parentContext)
    const renderResult = this.renderer.renderComponentTree(ctx)
    this.logger.info(`Rendered: ${ctx.type} (${ctx.id})`)
    return renderResult
  }

  // ============================================================================
  // 🔗 能力管理器访问
  // ============================================================================

  /** 获取能力管理器（所有能力相关操作都通过它完成） */
  getCapabilityManager(): ComponentCapabilityManager {
    return this.capabilityManager
  }

  // ============================================================================
  // 🔗 依赖访问器（不代理，只提供访问）
  // ============================================================================

  /** 获取组件注册表（使用：manager.getRegistry().register()） */
  getRegistry(): ComponentRegistry {
    return this.registry
  }

  // ============================================================================
  // 🛠️ 内部工具
  // ============================================================================

  /** 生成唯一 ID */
  private generateId(): string {
    return `spark-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /** 在树中查找 Context */
  private findInTree(node: ComponentContext, id: string): ComponentContext | undefined {
    if (node.id === id) return node
    if (node.children) {
      for (const child of node.children) {
        const found = this.findInTree(child, id)
        if (found) return found
      }
    }
    return undefined
  }

  /** 遍历树（深度优先）*/
  private walkTree(node: ComponentContext, callback: (ctx: ComponentContext) => void): void {
    callback(node)
    node.children?.forEach(child => this.walkTree(child, callback))
  }
}

// ============================================================================
// 🏭 单例和工厂函数（通过 Spark 命名空间访问）
// ============================================================================

/**
 * 默认全局实例
 * 
 * ⚠️ 使用 Spark._manager() 访问
 * @internal
 */
export const componentManager = new SparkComponentManagerImpl()

/**
 * 创建 Manager 实例
 * 
 * ⚠️ 使用 Spark.createManager() 访问
 * @internal
 */
export function createComponentManager(
  renderer?: SparkComponentRendererImpl, 
  registry?: ComponentRegistry,
  capabilityManager?: ComponentCapabilityManager
): ComponentManager {
  return new SparkComponentManagerImpl(renderer, registry, capabilityManager)
}

/**
 * 创建完整组件系统
 * 
 * ⚠️ 使用 Spark.createSystem() 访问
 * @internal
 */
export function createComponentSystem(): { 
  manager: ComponentManager
  registry: ComponentRegistry
  capabilities: ComponentCapabilityManager 
} {
  const registry = createComponentRegistry()
  const capabilities = createComponentCapabilityManager()
  const manager = createComponentManager(undefined, registry, capabilities)
  return { manager, registry, capabilities }
}