/**
 * 业务注册表。
 *
 * 职责：以 moduleId 为 key 管理 AiHostBusinessRuntime 实例。
 * 在工具循环中通过 AiHostOptions.registry.get() 查找运行时。
 *
 * ┌─────────────────────────────────────────┐
 * │          AiHostBusinessRegistry          │
 * │                                          │
 * │  register()  → 注册运行时（幂等检查）     │
 * │  get()       → 按 moduleId 查找          │
 * │  list()      → 列出所有已注册运行时       │
 * └─────────────────────────────────────────┘
 */

import type {
  AiHostBusinessRuntime,
} from './types'

export class AiHostBusinessRegistry {
  private readonly runtimes = new Map<string, AiHostBusinessRuntime>()

  /** 注册业务运行时；moduleId 重复则抛出 */
  register(runtime: AiHostBusinessRuntime): void {
    if (this.runtimes.has(runtime.moduleId)) {
      throw new Error(`Duplicate AI host business runtime: ${runtime.moduleId}`)
    }
    this.runtimes.set(runtime.moduleId, runtime)
  }

  /** 按 moduleId 查找业务运行时 */
  get(moduleId: string): AiHostBusinessRuntime | undefined {
    return this.runtimes.get(moduleId)
  }

  /** 列出所有已注册的业务运行时 */
  list(): readonly AiHostBusinessRuntime[] {
    return Array.from(this.runtimes.values())
  }
}
