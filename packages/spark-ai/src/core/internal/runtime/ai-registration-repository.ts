import type {
  AiBusinessRegistration,
  AiBusinessRegistrationData,
  AiBusinessRegistrationStoreSnapshot,
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreSnapshot,
} from '../../protocol/runtime-contracts'
import { ParameterPayloadRegistry } from '../knowledge/parameter-payload-registry'
import type { AiRuntimeProjector } from './ai-runtime-support'
import {
  moduleSourceFromBusiness,
  moduleStoreToBusinessStoreSnapshot,
  moduleToBusinessRegistration,
  moduleDataToBusinessData,
  parameterPayloadProvidersFromBusiness,
} from './ai-runtime-support'

export class AiRegistrationRepository {
  private readonly modules = new Map<string, AiModuleRegistration>()

  private readonly businessIds = new Set<string>()

  constructor(private readonly projector: AiRuntimeProjector) {}

  registerBusiness(source: AiBusinessRegistration | AiBusinessRegistrationData | AiBusinessRegistrationStoreSnapshot): AiModuleRegistration {
    const moduleSource = moduleSourceFromBusiness(source)
    const registration = this.projector.createRuntimeRegistration(moduleSource)
    this.projector.assertUniqueRegistrationKeys(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI business registration: ${registration.moduleId}`)
    }
    this.registerParameterPayloadProviders(parameterPayloadProvidersFromBusiness(source))
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

  getBusinessRegistration(businessId: string): AiBusinessRegistration | undefined {
    if (!this.businessIds.has(businessId)) return undefined
    const registration = this.modules.get(businessId)
    return registration === undefined ? undefined : moduleToBusinessRegistration(registration)
  }

  listBusinessRegistrations(): readonly AiBusinessRegistration[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const registration = this.modules.get(businessId)
      return registration === undefined ? [] : [moduleToBusinessRegistration(registration)]
    })
  }

  getBusinessRegistrationData(businessId: string): AiBusinessRegistrationData | undefined {
    if (!this.businessIds.has(businessId)) return undefined
    const data = this.getModuleRegistrationData(businessId)
    return data === undefined ? undefined : moduleDataToBusinessData(data)
  }

  listBusinessRegistrationData(): readonly AiBusinessRegistrationData[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const data = this.getBusinessRegistrationData(businessId)
      return data === undefined ? [] : [data]
    })
  }

  getBusinessRegistrationStoreSnapshot(businessId: string): AiBusinessRegistrationStoreSnapshot | undefined {
    if (!this.businessIds.has(businessId)) return undefined
    const snapshot = this.getModuleRegistrationStoreSnapshot(businessId)
    return snapshot === undefined ? undefined : moduleStoreToBusinessStoreSnapshot(snapshot)
  }

  listBusinessRegistrationStoreSnapshots(): readonly AiBusinessRegistrationStoreSnapshot[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const snapshot = this.getBusinessRegistrationStoreSnapshot(businessId)
      return snapshot === undefined ? [] : [snapshot]
    })
  }

  private registerParameterPayloadProviders(providers: ReadonlyArray<NonNullable<AiBusinessRegistration['parameterPayloadProviders']>[number]>): void {
    for (const provider of providers) {
      const existing = ParameterPayloadRegistry.defaultRegistry.getProvider(provider.payloadRef)
      if (existing === null) {
        ParameterPayloadRegistry.register(provider)
        continue
      }
      if (
        existing.payloadRef === provider.payloadRef
        && existing.description === provider.description
        && existing.queryPayloads === provider.queryPayloads
        && existing.guidePayload === provider.guidePayload
      ) {
        continue
      }
      throw new Error(`Duplicate parameter payload provider: ${provider.payloadRef}`)
    }
  }
}
