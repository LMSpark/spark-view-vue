/**
 * 依赖注入容器 - 实现依赖倒置原则(DIP)
 * 
 * SOLID原则应用：
 * - SRP: 单一职责 - 只负责依赖管理和注入
 * - OCP: 对扩展开放 - 支持注册任意服务
 * - LSP: 里氏替换 - 实现可以被替换而不影响使用
 * - ISP: 接口隔离 - 提供最小化的注入接口
 * - DIP: 依赖倒置 - 依赖抽象接口而非具体实现
 */

/**
 * 服务生命周期
 */
export enum ServiceLifetime {
  /** 单例 - 全局共享一个实例 */
  SINGLETON = 'singleton',
  /** 瞬态 - 每次请求创建新实例 */
  TRANSIENT = 'transient',
  /** 作用域 - 在同一作用域内共享实例 */
  SCOPED = 'scoped'
}

/**
 * 服务提供者类型
 */
export type ServiceProvider<T = unknown> = () => T | Promise<T>

/**
 * 服务描述符
 */
export interface ServiceDescriptor<T = unknown> {
  lifetime: ServiceLifetime
  provider: ServiceProvider<T>
  instance?: T
}

/**
 * 依赖注入容器接口
 */
export interface IDependencyContainer {
  /**
   * 注册服务
   */
  register<T>(
    identifier: string | symbol,
    provider: ServiceProvider<T>,
    lifetime?: ServiceLifetime
  ): void
  
  /**
   * 解析服务
   */
  resolve<T>(identifier: string | symbol): T
  
  /**
   * 尝试解析服务(不抛出异常)
   */
  tryResolve<T>(identifier: string | symbol): T | undefined
  
  /**
   * 检查服务是否已注册
   */
  has(identifier: string | symbol): boolean
  
  /**
   * 创建子容器(作用域)
   */
  createScope(): IDependencyContainer
  
  /**
   * 清除所有服务
   */
  clear(): void
}

/**
 * 依赖注入容器实现
 */
export class DependencyContainer implements IDependencyContainer {
  private services = new Map<string | symbol, ServiceDescriptor>()
  private scopedInstances = new Map<string | symbol, unknown>()
  private parent?: DependencyContainer
  
  constructor(parent?: DependencyContainer) {
    this.parent = parent
  }
  
  /**
   * 注册服务
   */
  register<T>(
    identifier: string | symbol,
    provider: ServiceProvider<T>,
    lifetime: ServiceLifetime = ServiceLifetime.SINGLETON
  ): void {
    this.services.set(identifier, {
      lifetime,
      provider
    })
  }
  
  /**
   * 注册单例服务
   */
  registerSingleton<T>(
    identifier: string | symbol,
    provider: ServiceProvider<T>
  ): void {
    this.register(identifier, provider, ServiceLifetime.SINGLETON)
  }
  
  /**
   * 注册瞬态服务
   */
  registerTransient<T>(
    identifier: string | symbol,
    provider: ServiceProvider<T>
  ): void {
    this.register(identifier, provider, ServiceLifetime.TRANSIENT)
  }
  
  /**
   * 注册作用域服务
   */
  registerScoped<T>(
    identifier: string | symbol,
    provider: ServiceProvider<T>
  ): void {
    this.register(identifier, provider, ServiceLifetime.SCOPED)
  }
  
  /**
   * 注册实例（单例模式）
   */
  registerInstance<T>(identifier: string | symbol, instance: T): void {
    this.services.set(identifier, {
      lifetime: ServiceLifetime.SINGLETON,
      provider: () => instance,
      instance
    })
  }
  
  /**
   * 解析服务
   */
  resolve<T>(identifier: string | symbol): T {
    const instance = this.tryResolve<T>(identifier)
    
    if (instance === undefined) {
      throw new Error(
        `Service not found: ${String(identifier)}. ` +
        'Make sure the service is registered before resolving.'
      )
    }
    
    return instance
  }
  
  /**
   * 尝试解析服务（不抛出异常）
   */
  tryResolve<T>(identifier: string | symbol): T | undefined {
    // 先在当前容器查找
    const descriptor = this.services.get(identifier)
    
    if (!descriptor) {
      // 如果有父容器，在父容器中查找
      if (this.parent) {
        return this.parent.tryResolve<T>(identifier)
      }
      return undefined
    }
    
    // 根据生命周期返回实例
    switch (descriptor.lifetime) {
      case ServiceLifetime.SINGLETON:
        return this.resolveSingleton<T>(identifier, descriptor)
        
      case ServiceLifetime.SCOPED:
        return this.resolveScoped<T>(identifier, descriptor)
        
      case ServiceLifetime.TRANSIENT:
        return this.resolveTransient<T>(descriptor)
        
      default:
        throw new Error(`Unknown service lifetime: ${descriptor.lifetime}`)
    }
  }
  
  /**
   * 解析单例服务
   */
  private resolveSingleton<T>(
    _identifier: string | symbol,
    descriptor: ServiceDescriptor
  ): T {
    if (!descriptor.instance) {
      descriptor.instance = descriptor.provider()
    }
    return descriptor.instance as T
  }
  
  /**
   * 解析作用域服务
   */
  private resolveScoped<T>(
    identifier: string | symbol,
    descriptor: ServiceDescriptor
  ): T {
    if (!this.scopedInstances.has(identifier)) {
      this.scopedInstances.set(identifier, descriptor.provider())
    }
    return this.scopedInstances.get(identifier) as T
  }
  
  /**
   * 解析瞬态服务
   */
  private resolveTransient<T>(descriptor: ServiceDescriptor): T {
    return descriptor.provider() as T
  }
  
  /**
   * 检查服务是否已注册
   */
  has(identifier: string | symbol): boolean {
    return this.services.has(identifier) || (this.parent?.has(identifier) ?? false)
  }
  
  /**
   * 创建子容器（作用域）
   */
  createScope(): IDependencyContainer {
    return new DependencyContainer(this)
  }
  
  /**
   * 清除所有服务
   */
  clear(): void {
    this.services.clear()
    this.scopedInstances.clear()
  }
}

/**
 * 全局容器实例
 */
const globalContainer = new DependencyContainer()

/**
 * 便捷导出
 */
export const container = globalContainer

/**
 * 服务标识符（推荐使用Symbol）
 */
export const ServiceIdentifiers = {
  // 应用服务
  AppContext: Symbol('AppContext'),
  Router: Symbol('Router'),
  Store: Symbol('Store'),
  
  // 日志服务
  Logger: Symbol('Logger'),
  PageLogger: Symbol('PageLogger'),
  ApiLogger: Symbol('ApiLogger'),
  
  // 配置服务
  ConfigLoader: Symbol('ConfigLoader'),
  
  // 数据服务
  DataSetManager: Symbol('DataSetManager'),
  
  // 环境服务
  Environment: Symbol('Environment'),
  
  // 组件服务
  ComponentManager: Symbol('ComponentManager'),
  ComponentRegistry: Symbol('ComponentRegistry')
} as const

/**
 * 使用示例：
 * 
 * ```typescript
 * import { container, ServiceIdentifiers, ServiceLifetime } from '@spark-view/spark-app'
 * 
 * // 注册服务
 * container.register(
 *   ServiceIdentifiers.ConfigLoader,
 *   () => new PageConfigLoader(),
 *   ServiceLifetime.SINGLETON
 * )
 * 
 * // 或使用便捷方法
 * container.registerSingleton(
 *   ServiceIdentifiers.Logger,
 *   () => createLogger({ level: 'info' })
 * )
 * 
 * // 解析服务
 * const logger = container.resolve(ServiceIdentifiers.Logger)
 * logger.info('Service resolved')
 * 
 * // 创建作用域
 * const scopedContainer = container.createScope()
 * scopedContainer.registerScoped(
 *   ServiceIdentifiers.DataSetManager,
 *   () => new DataSetManager()
 * )
 * ```
 */
