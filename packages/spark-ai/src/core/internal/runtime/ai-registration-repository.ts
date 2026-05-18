import type {
  IBusinessRegistration,
  IBusinessRegistrationData,
  IBusinessRegistrationStoreSnapshot,
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreSnapshot,
} from '../../protocol/runtime-contracts'
import type { AiRuntimeProjector } from './ai-runtime-support'
import {
  moduleSourceFromBusiness,
  moduleStoreToBusinessStoreSnapshot,
  moduleToBusinessRegistration,
  moduleDataToBusinessData,
} from './ai-runtime-support'

export class AiRegistrationRepository {
  private readonly modules = new Map<string, AiModuleRegistration>()

  private readonly businessIds = new Set<string>()

  constructor(private readonly projector: AiRuntimeProjector) {}

  registerBusiness(source: IBusinessRegistration | IBusinessRegistrationData | IBusinessRegistrationStoreSnapshot): AiModuleRegistration {
    const moduleSource = moduleSourceFromBusiness(source)
    const registration = this.projector.createRuntimeRegistration(moduleSource)
    this.projector.assertUniqueRegistrationKeys(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI business registration: ${registration.moduleId}`)
    }
    this.modules.set(registration.moduleId, registration)
    this.businessIds.add(registration.moduleId)
    return registration
  }

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

  getBusinessRegistration(businessId: string): IBusinessRegistration | undefined {
    if (!this.businessIds.has(businessId)) return undefined
    const registration = this.modules.get(businessId)
    return registration === undefined ? undefined : moduleToBusinessRegistration(registration)
  }

  listBusinessRegistrations(): readonly IBusinessRegistration[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const registration = this.modules.get(businessId)
      return registration === undefined ? [] : [moduleToBusinessRegistration(registration)]
    })
  }

  getBusinessRegistrationData(businessId: string): IBusinessRegistrationData | undefined {
    if (!this.businessIds.has(businessId)) return undefined
    const data = this.getModuleRegistrationData(businessId)
    return data === undefined ? undefined : moduleDataToBusinessData(data)
  }

  listBusinessRegistrationData(): readonly IBusinessRegistrationData[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const data = this.getBusinessRegistrationData(businessId)
      return data === undefined ? [] : [data]
    })
  }

  getBusinessRegistrationStoreSnapshot(businessId: string): IBusinessRegistrationStoreSnapshot | undefined {
    if (!this.businessIds.has(businessId)) return undefined
    const snapshot = this.getModuleRegistrationStoreSnapshot(businessId)
    return snapshot === undefined ? undefined : moduleStoreToBusinessStoreSnapshot(snapshot)
  }

  listBusinessRegistrationStoreSnapshots(): readonly IBusinessRegistrationStoreSnapshot[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const snapshot = this.getBusinessRegistrationStoreSnapshot(businessId)
      return snapshot === undefined ? [] : [snapshot]
    })
  }
}
