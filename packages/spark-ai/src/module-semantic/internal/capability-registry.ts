/**
 * @packageDocumentation
 *
 * Capability 注册表。
 *
 * 按 kind 索引所有 ModuleCapability 实现。kind 级单例,
 * 一种模块类型对应一份 Capability 实现。
 *
 * 冲突规则:同一 kind 重复注册抛 CapabilityConflictError,
 * 不允许覆盖。
 */

import type { ModuleCapability } from '../protocol/capability'

/**
 * 同一 kind 重复注册 Capability 时抛此错误。
 */
export class CapabilityConflictError extends Error {
  public readonly kind: string

  constructor(kind: string) {
    super(`Capability for kind "${kind}" is already registered`)
    this.name = 'CapabilityConflictError'
    this.kind = kind
  }
}

/**
 * 查询未注册的 kind 对应 Capability 时抛此错误。
 */
export class CapabilityNotFoundError extends Error {
  public readonly kind: string

  constructor(kind: string) {
    super(`Capability for kind "${kind}" is not registered`)
    this.name = 'CapabilityNotFoundError'
    this.kind = kind
  }
}

/**
 * Capability 注册表。
 *
 * 使用模式:
 * ```ts
 * const registry = new CapabilityRegistry()
 * registry.register(new SchoolCapability())   // 自带 kind = 'school'
 * registry.register(new GradeCapability())
 * // ...
 * const cap = registry.require('school')
 * ```
 *
 * 注册时按 Capability.kind 取键,所以业务方实现要保证 kind 与 ModuleKind 对齐。
 */
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, ModuleCapability>()

  /**
   * 注册一个 Capability 实现。冲突时抛错。
   */
  public register(capability: ModuleCapability): void {
    if (this.capabilities.has(capability.kind)) {
      throw new CapabilityConflictError(capability.kind)
    }
    this.capabilities.set(capability.kind, capability)
  }

  /**
   * 按 kind 查询,未注册返回 undefined。
   */
  public get(kind: string): ModuleCapability | undefined {
    return this.capabilities.get(kind)
  }

  /**
   * 按 kind 查询,未注册抛 CapabilityNotFoundError。
   */
  public require(kind: string): ModuleCapability {
    const found = this.capabilities.get(kind)
    if (found === undefined) {
      throw new CapabilityNotFoundError(kind)
    }
    return found
  }

  /**
   * 是否已注册。
   */
  public has(kind: string): boolean {
    return this.capabilities.has(kind)
  }

  /**
   * 列出所有已注册的 kind。
   */
  public listKinds(): readonly string[] {
    return Array.from(this.capabilities.keys())
  }
}
