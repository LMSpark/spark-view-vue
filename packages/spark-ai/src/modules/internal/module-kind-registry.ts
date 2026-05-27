/**
 * ═══════════════════════════════════════════════════════════════
 * module-semantic/internal/module-kind-registry.ts — 模块类型注册表
 * ═══════════════════════════════════════════════════════════════
 *
 * 【架构定位】协议层内部组件，被 Navigator 和 AiModuleRuntime 消费。
 *   按 kind 字符串索引所有已注册的 AiModule 实例。
 *
 * 【设计决策】
 *   - 启动期注册，运行期只读。
 *   - 重复注册直接抛 AiModuleConflictError，不允许静默覆盖。
 *   - 注册入口只接收已构造的 AiModule 实例；构造依赖必须由业务侧显式完成。
 *
 * 【消费方】Navigator（路径验证 + 发现）、AiModuleRuntime（注册入口）
 * ═══════════════════════════════════════════════════════════════
 */

import type { AiModule } from '../protocol'

/**
 * 同名 kind 重复注册时抛此错误。
 * 业务方可在启动阶段 try-catch 决定是否降级处理。
 */
export class AiModuleConflictError extends Error {
  public readonly kind: string

  constructor(kind: string) {
    super(`AiModule "${kind}" is already registered`)
    this.name = 'AiModuleConflictError'
    this.kind = kind
  }
}

/**
 * 未注册 kind 被 require() 查询时抛此错误。
 * get() 方法不会抛错，返回 undefined。
 */
export class AiModuleNotFoundError extends Error {
  public readonly kind: string

  constructor(kind: string) {
    super(`AiModule "${kind}" is not registered`)
    this.name = 'AiModuleNotFoundError'
    this.kind = kind
  }
}

/**
 * 模块类型注册表。
 *
 * 使用示例：
 * ```ts
 * const registry = new AiModuleRegistry()
 * registry.register(createSchoolAiModule())
 * const schoolKind = registry.require('school')  // 未注册会抛错
 * const maybe = registry.get('unknown')           // 返回 undefined
 * ```
 */
export class AiModuleRegistry {
  private readonly kinds = new Map<string, AiModule>()

  /** 注册一个模块类型实例。kind 冲突时抛 AiModuleConflictError。 */
  public register<TKind extends AiModule>(moduleKind: TKind): TKind {
    if (this.kinds.has(moduleKind.kind)) {
      throw new AiModuleConflictError(moduleKind.kind)
    }
    this.kinds.set(moduleKind.kind, moduleKind)
    return moduleKind
  }

  /** 按 kind 查询，未注册返回 undefined。安全查询，不抛错。 */
  public get(kind: string): AiModule | undefined {
    return this.kinds.get(kind)
  }

  /** 按 kind 查询，未注册抛 AiModuleNotFoundError。 */
  public require(kind: string): AiModule {
    const found = this.kinds.get(kind)
    if (found === undefined) {
      throw new AiModuleNotFoundError(kind)
    }
    return found
  }

  /** 是否已注册。 */
  public has(kind: string): boolean {
    return this.kinds.has(kind)
  }

  /** 列出所有已注册的 kind（注册顺序，不可变副本）。 */
  public list(): readonly AiModule[] {
    return Array.from(this.kinds.values())
  }
}
