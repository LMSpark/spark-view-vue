/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/internal/module-kind-registry.ts — 模块类型注册表
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层内部组件，被 Navigator 和 ModuleSemanticRuntime 消费。
 *   按 kind 字符串索引所有已注册的 ModuleKind 实例。
 *
 * 【设计决策】
 *   - 启动期注册，运行期只读。
 *   - 重复注册直接抛 ModuleKindConflictError，不允许静默覆盖。
 *   - ModuleKind 同时是元数据和运行入口，无需额外的注册适配层。
 *
 * 【消费方】Navigator（路径验证 + 发现）、ModuleSemanticRuntime（注册入口）
 * ═══════════════════════════════════════════════════════════════
 */

import type { ModuleKind } from '../protocol/module-kind'

/**
 * 同名 kind 重复注册时抛此错误。
 * 业务方可在启动阶段 try-catch 决定是否降级处理。
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
 * 未注册 kind 被 require() 查询时抛此错误。
 * get() 方法不会抛错，返回 undefined。
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
 * 使用示例：
 * ```ts
 * const registry = new ModuleKindRegistry()
 * registry.register(createSchoolModuleKind())
 * registry.register(createGradeModuleKind())
 * const schoolKind = registry.require('school')  // 未注册会抛错
 * const maybe = registry.get('unknown')           // 返回 undefined
 * ```
 */
export class ModuleKindRegistry {
  private readonly kinds = new Map<string, ModuleKind>()

  /** 注册一个模块类型。kind 冲突时抛 ModuleKindConflictError。 */
  public register(moduleKind: ModuleKind): void {
    if (this.kinds.has(moduleKind.kind)) {
      throw new ModuleKindConflictError(moduleKind.kind)
    }
    this.kinds.set(moduleKind.kind, moduleKind)
  }

  /** 按 kind 查询，未注册返回 undefined。安全查询，不抛错。 */
  public get(kind: string): ModuleKind | undefined {
    return this.kinds.get(kind)
  }

  /** 按 kind 查询，未注册抛 ModuleKindNotFoundError。 */
  public require(kind: string): ModuleKind {
    const found = this.kinds.get(kind)
    if (found === undefined) {
      throw new ModuleKindNotFoundError(kind)
    }
    return found
  }

  /** 是否已注册。 */
  public has(kind: string): boolean {
    return this.kinds.has(kind)
  }

  /** 列出所有已注册的 kind（注册顺序，不可变副本）。 */
  public list(): readonly ModuleKind[] {
    return Array.from(this.kinds.values())
  }
}
