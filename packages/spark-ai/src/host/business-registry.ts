/**
 * 语义业务注册表。
 *
 * 以 moduleId 为 key 管理 AiHostBusinessRegistration。注册时补齐默认
 * sessionStore,调用方不需要再包一层 runtime adapter。
 */

import type { AiHostBusinessRegistration } from './types'
import { DefaultAiHostSessionStore } from './session-store'

export class AiHostBusinessRegistry {
  private readonly registrations = new Map<string, AiHostBusinessRegistration>()

  public register(registration: AiHostBusinessRegistration): void {
    if (this.registrations.has(registration.moduleId)) {
      throw new Error(`Duplicate AI host business registration: ${registration.moduleId}`)
    }
    this.registrations.set(registration.moduleId, withDefaultSessionStore(registration))
  }

  public get(moduleId: string): AiHostBusinessRegistration | undefined {
    return this.registrations.get(moduleId)
  }

  public list(): readonly AiHostBusinessRegistration[] {
    return Array.from(this.registrations.values())
  }
}

function withDefaultSessionStore(registration: AiHostBusinessRegistration): AiHostBusinessRegistration {
  if (registration.sessionStore !== undefined) return registration
  return {
    ...registration,
    sessionStore: new DefaultAiHostSessionStore(),
  }
}
