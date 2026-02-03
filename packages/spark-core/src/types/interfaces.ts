// Core public interfaces for packages/spark-core

export interface IComponentDefinition {
  type: string
  name?: string
  version?: string
}

export interface IComponentRegistry {
  register(def: IComponentDefinition): void
  unregister(type: string): boolean
  get(type: string): IComponentDefinition | undefined
  has(type: string): boolean
  getAllTypes(): string[]
}

/**
 * 组件实例上下文接口
 * 
 * 作用域：单个 SPARK 组件实例
 * 生命周期：组件创建时生成，销毁时清理
 * 
 * 用途：
 * - 管理组件的能力提供/消费关系（Provider/Consumer 模式）
 * - 支持组件间通过能力名称进行松耦合通信
 * - 记录组件树层级关系（parentId）
 * 
 * 能力系统：
 * - providers: 组件提供的能力（如 'data-source', 'selection-manager'）
 * - consumers: 组件消费的能力（从父组件或全局获取）
 * - 能力通过名称字符串标识，支持动态注册和查找
 * 
 * 注意：
 * - 这是 SPARK 组件系统的核心抽象
 * - 与 Vue 组件实例分离，支持跨框架复用
 * - 能力传递遵循"就近原则"：优先从最近的父组件获取
 * 
 * 典型使用场景：
 * - SparkEJ2Grid 提供 'selection-manager' 能力
 * - SparkEJ2Column 消费 'column-manager' 能力
 * - 动态表单组件间通过能力协作
 */
export interface IComponentContext {
  /** 组件实例唯一标识符 */
  id: string
  /** 组件类型（kebab-case，如 'spark-ej2-grid'） */
  type: string
  /** 父组件实例 ID（用于能力查找） */
  parentId?: string
  /** 组件提供的能力映射表 { 能力名称: 能力实现 } */
  providers: Record<string, unknown>
  /** 组件消费的能力映射表 { 能力名称: 能力实例 } */
  consumers: Record<string, unknown>
}

export interface IComponentManager {
  registerComponent(def: IComponentDefinition): void
  createContext(cfg: { type: string; id?: string }, parentId?: string): IComponentContext
  destroyContext(id: string): void
  getContext(id: string): IComponentContext | undefined
  getAllContexts(): IComponentContext[]
}

export interface ICapabilityProvider {
  name: string
  version?: string
  interface?: unknown
  implementation?: unknown
}

export interface ICapabilityManager {
  registerConnector(name: string, impl: unknown): void
  connect(provider: ICapabilityProvider, consumer: unknown): boolean
  disconnect(providerName: string, consumer: unknown): void
}

export interface ILogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface ISparkPlugin {
  name: string
  install(manager: IComponentManager): void | Promise<void>
  uninstall?(manager: IComponentManager): void | Promise<void>
}
