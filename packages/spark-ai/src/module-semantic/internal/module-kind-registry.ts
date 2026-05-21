/**
 * @packageDocumentation
 *
 * 模块类型注册表。
 *
 * 按 kind 索引所有 ModuleKind。启动期注册,运行期只读。
 *
 * 冲突规则:同一 kind 重复注册直接抛 ModuleKindConflictError,
 * 不允许覆盖,避免业务方误用导致 silent 覆盖。
 *
 * ModuleKind 同时是语义描述对象和通用运行入口,业务无需额外注册第二套对象。
 */

import type { ModuleKind } from '../protocol/module-kind'

/**
 * 同名 kind 重复注册时抛此错误。
 */
export class ModuleKindConflictError extends Error {
  public readonly kind: string

  constructor(kind: string) {
    super(`ModuleKind "${kind}" is already registered`)
    this.name = 'ModuleKindConflictError'
    this.kind = kind
  }
}

/**
 * 未注册 kind 被查询时抛此错误。
 */
export class ModuleKindNotFoundError extends Error {
  public readonly kind: string

  constructor(kind: string) {
    super(`ModuleKind "${kind}" is not registered`)
    this.name = 'ModuleKindNotFoundError'
    this.kind = kind
  }
}

/**
 * 模块类型注册表。
 *
 * 使用模式:
 * ```ts
 * const registry = new ModuleKindRegistry()
 * registry.register(createSchoolModuleKind())
 * registry.register(createGradeModuleKind())
 * // ... 启动结束
 * const schoolKind = registry.require('school')
 * ```
 */
export class ModuleKindRegistry {
  private readonly kinds = new Map<string, ModuleKind>()

  /**
   * 注册一个模块类型。kind 冲突时抛错。
   */
  public register(moduleKind: ModuleKind): void {
    if (this.kinds.has(moduleKind.kind)) {
      throw new ModuleKindConflictError(moduleKind.kind)
    }
    this.kinds.set(moduleKind.kind, moduleKind)
  }

  /**
   * 按 kind 查询,未注册返回 undefined。
   */
  public get(kind: string): ModuleKind | undefined {
    return this.kinds.get(kind)
  }

  /**
   * 按 kind 查询,未注册抛 ModuleKindNotFoundError。
   */
  public require(kind: string): ModuleKind {
    const found = this.kinds.get(kind)
    if (found === undefined) {
      throw new ModuleKindNotFoundError(kind)
    }
    return found
  }

  /**
   * 是否已注册。
   */
  public has(kind: string): boolean {
    return this.kinds.has(kind)
  }

  /**
   * 列出所有已注册的 kind(顺序为注册顺序)。
   */
  public list(): readonly ModuleKind[] {
    return Array.from(this.kinds.values())
  }
}
