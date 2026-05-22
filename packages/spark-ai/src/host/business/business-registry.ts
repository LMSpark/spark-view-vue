/**
 * AI business registry.
 */

import { DefaultAiHostSessionStore } from '../session/default-session-store'
import { AiHostBusinessRegistration } from './business-types'

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
  return new AiHostBusinessRegistration({
    ...registration,
    sessionStore: new DefaultAiHostSessionStore(),
  })
}
