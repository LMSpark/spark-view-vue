import { valid as semverValid, satisfies as semverSatisfies, gte as semverGte } from 'semver'
import { Logger } from '@spark-view/spark-utils'
import type { ComponentConfig, ComponentRegistry } from '../types/spark-component.js'

/**
 * SPARK 组件注册表实现
 * 
 * 核心职责：管理组件类型定义（设计图纸）
 * - 注册和注销组件类型
 * - 查找组件定义
 * - 版本兼容性检查
 * - 能力提供者匹配
 * 
 * 设计模式：注册表模式（Registry Pattern）
 * - 默认实例：componentRegistry（全局共享）
 * - 工厂函数：createComponentRegistry（隔离实例）
 * 
 * 与 Manager 的区别：
 * - Registry 存储类型定义（如类的定义）
 * - Manager 管理实例生命周期（如类的实例）
 */
export class SparkComponentRegistryImpl implements ComponentRegistry {
  /** 组件类型定义存储（key: 组件类型名, value: 组件配置定义） */
  private components = new Map<string, ComponentConfig>()
  /** 日志记录器 */
  private logger = Logger('Spark:Registry')

  /**
   * 注册组件类型定义
   * 
   * @param type - 组件类型名称（如 'spark-button', 'spark-grid'）
   * @param definition - 组件配置定义
   * @throws 如果定义无效则抛出错误
   * 
   * @example
   * ```typescript
   * registry.register('spark-button', {
   *   type: 'spark-button',
   *   name: '按钮组件',
   *   version: '1.0.0',
   *   component: ButtonComponent
   * })
   * ```
   */
  register(type: string, definition: ComponentConfig): void {
    if (this.components.has(type)) {
      this.logger.warn(`Component type '${type}' is already registered. Overwriting...`)
    }
    if (!this.validateDefinition(definition)) {
      throw new Error(`Invalid component definition for type '${type}'`)
    }
    this.components.set(type, definition)
    this.logger.info(`✅ Registered SPARK component: ${type} (${definition.version})`)
  }

  /**
   * 获取组件类型定义
   * 
   * @param type - 组件类型名称
   * @returns 组件定义或 undefined（如果未注册）
   */
  get(type: string): ComponentConfig | undefined {
    return this.components.get(type)
  }

  /**
   * 检查组件类型是否已注册
   * 
   * @param type - 组件类型名称
   * @returns 是否已注册
   */
  has(type: string): boolean {
    return this.components.has(type)
  }

  /**
   * 获取所有已注册的组件类型名称
   * 
   * @returns 组件类型名称数组
   */
  getAllTypes(): string[] {
    return Array.from(this.components.keys())
  }

  /**
   * 获取所有组件定义
   * 
   * @returns 组件定义数组
   */
  getAllDefinitions(): ComponentConfig[] {
    return Array.from(this.components.values())
  }

  /**
   * 注销组件类型
   * 
   * @param type - 组件类型名称
   * @returns 是否成功注销
   */
  unregister(type: string): boolean {
    const removed = this.components.delete(type)
    if (removed) this.logger.info(`🗑️ Unregistered SPARK component: ${type}`)
    return removed
  }

  /**
   * 清空所有组件注册
   * 
   * 注意：此操作不可逆，谨慎使用
   */
  clear(): void {
    this.components.clear()
    this.logger.info('🧹 Cleared all SPARK component registrations')
  }

  /**
   * 验证组件定义是否有效
   * 
   * @param def - 组件定义
   * @returns 是否有效
   */
  private validateDefinition(def: ComponentConfig): boolean {
    if (!def.type) return false
    if (!def.name) return false
    // component and version are optional for logical components
    return true
  }

  /**
   * 查找能力的兼容提供者组件
   * 
   * 根据能力名称和最小版本要求，查找所有兼容的提供者组件类型
   * 
   * 版本匹配规则：
   * 1. 如果都是严格版本号（如 '1.2.3'），使用 gte 比较
   * 2. 如果 minVersion 是范围（如 '^1.2.0'），使用 semver satisfies
   * 3. 如果都不是标准 semver，使用字符串精确匹配
   * 
   * @param capabilityName - 能力名称（如 'data-source', 'row-selection'）
   * @param minVersion - 最小版本要求（可选，支持 semver 范围）
   * @returns 兼容的组件类型名称数组
   * 
   * @example
   * ```typescript
   * // 查找所有提供 'data-source' 能力的组件
   * registry.findCompatibleProviders('data-source')
   * // => ['spark-grid', 'spark-table']
   * 
   * // 查找版本 >= 2.0.0 的提供者
   * registry.findCompatibleProviders('data-source', '2.0.0')
   * // => ['spark-grid']
   * 
   * // 使用 semver 范围
   * registry.findCompatibleProviders('data-source', '^1.2.0')
   * // => ['spark-grid', 'spark-table']
   * ```
   */
  findCompatibleProviders(capabilityName: string, minVersion?: string): string[] {
    const matches: string[] = []
    this.components.forEach((def, type) => {
      if (def.providers && Array.isArray(def.providers)) {
        for (const p of def.providers) {
          if (p.name === capabilityName) {
            if (!minVersion) { matches.push(type); break }
            const v = p.version ?? '0.0.0'
            try {
              // If both are strict versions (e.g., '1.2.3'), use gte for minimal version semantics.
              if (semverValid(v) && semverValid(minVersion)) {
                if (semverGte(v, minVersion)) { matches.push(type); break }
              } else if (semverValid(v) && semverSatisfies(v, minVersion)) {
                // minVersion may be a range like '^1.2.0' or '>=1.2.0 <2.0.0'
                matches.push(type); break
              } else if (v === minVersion) {
                // fallback for non-semver tokens
                matches.push(type); break
              }
            } catch (e) {
              // on unexpected parse issues, fallback to exact match
              this.logger.warn(`semver parse failed for provider version ${v} minVersion ${minVersion}: ${String(e)}`)
              if (v === minVersion) { matches.push(type); break }
            }
          }
        }
      }
    })
    return matches
  }
}

/**
 * 默认的全局组件注册表实例
 * 
 * 使用场景：
 * - 应用级别的组件类型管理
 * - 全局共享的组件定义
 * - 单一注册表架构
 * 
 * @example
 * ```typescript
 * import { componentRegistry } from '@spark-view/spark-component'
 * 
 * // 注册组件
 * componentRegistry.register('my-component', definition)
 * 
 * // 查找组件
 * const def = componentRegistry.get('my-component')
 * ```
 */
export const componentRegistry = new SparkComponentRegistryImpl()

/**
 * 创建新的隔离组件注册表实例
 * 
 * 使用场景：
 * - 测试隔离（每个测试用例独立注册表）
 * - 多租户应用（每个租户独立注册表）
 * - 插件系统（每个插件独立注册表）
 * - 沙箱环境（隔离的组件定义）
 * 
 * @returns 新的注册表实例
 * 
 * @example
 * ```typescript
 * // 测试场景：隔离的注册表
 * const testRegistry = createComponentRegistry()
 * testRegistry.register('test-component', mockDefinition)
 * 
 * // 多租户场景：租户独立的组件库
 * const tenantRegistry = createComponentRegistry()
 * tenantRegistry.register('tenant-custom-component', customDef)
 * 
 * // 与自定义 Manager 配合使用
 * const manager = createComponentManager(undefined, testRegistry)
 * ```
 */
export function createComponentRegistry(): ComponentRegistry {
  return new SparkComponentRegistryImpl()
}

// NOTE: convenience helpers were removed to avoid duplicating the public namespace API.
// Use `Spark.registerSparkComponent(...)` or `componentRegistry.register(...)` instead.
