import type { AiModuleRegistration } from '../../protocol/runtime-contracts'
import type { AiRuntimeProjector } from './ai-runtime-support'

export class AiRegistrationRepository {
  private readonly modules = new Map<string, AiModuleRegistration>()

  constructor(private readonly projector: AiRuntimeProjector) {}

  registerModule(registration: AiModuleRegistration): AiModuleRegistration {
    this.projector.assertUniqueRegistrationKeys(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI module registration: ${registration.moduleId}`)
    }
    this.modules.set(registration.moduleId, registration)
    return registration
  }

  getModuleOrThrow(moduleId: string): AiModuleRegistration {
    const module = this.modules.get(moduleId)
    if (module === undefined) {
      throw new Error(`Unknown AI module registration: ${moduleId}`)
    }
    return module
  }

  getModuleRegistration(moduleId: string): AiModuleRegistration | undefined {
    return this.modules.get(moduleId)
  }

  listModuleRegistrations(): readonly AiModuleRegistration[] {
    return Array.from(this.modules.values())
  }
}
