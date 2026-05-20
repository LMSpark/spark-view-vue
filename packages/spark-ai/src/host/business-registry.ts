/**
 * 业务注册表。
 */

import type {
  AiHostBusinessRuntime,
} from './types'

export class AiHostBusinessRegistry {
  private readonly runtimes = new Map<string, AiHostBusinessRuntime>()

  register(runtime: AiHostBusinessRuntime): void {
    if (this.runtimes.has(runtime.moduleId)) {
      throw new Error(`Duplicate AI host business runtime: ${runtime.moduleId}`)
    }
    this.runtimes.set(runtime.moduleId, runtime)
  }

  get(moduleId: string): AiHostBusinessRuntime | undefined {
    return this.runtimes.get(moduleId)
  }

  list(): readonly AiHostBusinessRuntime[] {
    return Array.from(this.runtimes.values())
  }
}
