import type {
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreSnapshot,
} from '../../protocol/runtime-contracts'
import type { AiRuntimeProjector } from './ai-runtime-support'

export class AiRegistrationRepository {
  private readonly modules = new Map<string, AiModuleRegistration>()

  constructor(private readonly projector: AiRuntimeProjector) {}

  registerModule(source: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiModuleRegistration {
    const registration = this.projector.createRuntimeRegistration(source)
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

  getModuleRegistrationData(moduleId: string): AiModuleRegistrationData | undefined {
    const registration = this.modules.get(moduleId)
    return registration === undefined ? undefined : this.projector.createRegistrationData(registration)
  }

  listModuleRegistrationData(): readonly AiModuleRegistrationData[] {
    return Array.from(this.modules.values()).map((registration) => this.projector.createRegistrationData(registration))
  }

  getModuleRegistrationStoreSnapshot(moduleId: string): AiModuleRegistrationStoreSnapshot | undefined {
    const registration = this.modules.get(moduleId)
    return registration === undefined ? undefined : this.projector.createRegistrationStoreSnapshot(registration)
  }

  listModuleRegistrationStoreSnapshots(): readonly AiModuleRegistrationStoreSnapshot[] {
    return Array.from(this.modules.values()).map((registration) => this.projector.createRegistrationStoreSnapshot(registration))
  }

}
