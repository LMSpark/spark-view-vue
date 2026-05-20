/**
 * 业务注册表。
 *
 * 职责：以 moduleId 为 key 管理 AiHostBusinessRuntime 实例。
 * 在工具循环中通过 AiHostOptions.registry.get() 查找运行时。
 *
 * 使用流程：
 * ┌──────────────────────────────────────────────────────┐
 * │ 1. 创建 AiHostBusinessRegistry 实例                  │
 * │ 2. register(runtime) → 注册业务运行时（幂等检查）      │
 * │ 3. get(moduleId)   → 按 ID 查找运行时                 │
 * │ 4. list()          → 列出所有已注册运行时              │
 * └──────────────────────────────────────────────────────┘
 *
 * 线程安全：内部使用 Map 存储，注册时检查重复 ID，
 * 重复注册会抛出错误（非幂等，调用方需保证不重复注册）。
 */

import type {
  AiHostBusinessRuntime,
} from './types'

export class AiHostBusinessRegistry {
  /** 内部存储：moduleId → 业务运行时实例 */
  private readonly runtimes = new Map<string, AiHostBusinessRuntime>()

  /**
   * 注册业务运行时。
   * 如果 moduleId 已存在则抛出错误，防止覆盖已有运行时。
   */
  register(runtime: AiHostBusinessRuntime): void {
    if (this.runtimes.has(runtime.moduleId)) {
      throw new Error(`Duplicate AI host business runtime: ${runtime.moduleId}`)
    }
    this.runtimes.set(runtime.moduleId, runtime)
  }

  /**
   * 按 moduleId 查找业务运行时。
   * 未找到返回 undefined，不抛出异常。
   */
  get(moduleId: string): AiHostBusinessRuntime | undefined {
    return this.runtimes.get(moduleId)
  }

  /**
   * 列出所有已注册的业务运行时。
   * 返回只读数组快照，调用方修改不影响内部状态。
   */
  list(): readonly AiHostBusinessRuntime[] {
    return Array.from(this.runtimes.values())
  }
}
