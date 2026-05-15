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

export class AiRegistrationRepository {
  private readonly modules = new Map<string, AiModuleRegistration>()

  private readonly businessIds = new Set<string>()

  constructor(private readonly projector: AiRuntimeProjector) {}

  registerBusiness(source: AiBusinessRegistration | AiBusinessRegistrationData | AiBusinessRegistrationStoreSnapshot): AiModuleRegistration {
    const moduleSource = AiRegistrationRepository.moduleSourceFromBusiness(source)
    const registration = this.projector.createRuntimeRegistration(moduleSource)
    this.projector.assertUniqueRegistrationKeys(registration)
    if (this.modules.has(registration.moduleId)) {
      throw new Error(`Duplicate AI business registration: ${registration.moduleId}`)
    }
    this.registerParameterPayloadProviders(AiRegistrationRepository.parameterPayloadProvidersFromBusiness(source))
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
    return registration === undefined ? undefined : AiRegistrationRepository.moduleToBusinessRegistration(registration)
  }

  listBusinessRegistrations(): readonly AiBusinessRegistration[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const registration = this.modules.get(businessId)
      return registration === undefined ? [] : [AiRegistrationRepository.moduleToBusinessRegistration(registration)]
    })
  }

  getBusinessRegistrationData(businessId: string): AiBusinessRegistrationData | undefined {
    if (!this.businessIds.has(businessId)) return undefined
    const data = this.getModuleRegistrationData(businessId)
    return data === undefined ? undefined : AiRegistrationRepository.moduleDataToBusinessData(data)
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
    return snapshot === undefined ? undefined : AiRegistrationRepository.moduleStoreToBusinessStoreSnapshot(snapshot)
  }

  listBusinessRegistrationStoreSnapshots(): readonly AiBusinessRegistrationStoreSnapshot[] {
    return Array.from(this.businessIds.values()).flatMap((businessId) => {
      const snapshot = this.getBusinessRegistrationStoreSnapshot(businessId)
      return snapshot === undefined ? [] : [snapshot]
    })
  }

  moduleToBusinessRegistration(module: AiModuleRegistration): AiBusinessRegistration {
    return AiRegistrationRepository.moduleToBusinessRegistration(module)
  }

  moduleDataToBusinessData(data: AiModuleRegistrationData): AiBusinessRegistrationData {
    return AiRegistrationRepository.moduleDataToBusinessData(data)
  }

  moduleStoreToBusinessStoreSnapshot(snapshot: AiModuleRegistrationStoreSnapshot): AiBusinessRegistrationStoreSnapshot {
    return AiRegistrationRepository.moduleStoreToBusinessStoreSnapshot(snapshot)
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

  private static parameterPayloadProvidersFromBusiness(
    source: AiBusinessRegistration | AiBusinessRegistrationData | AiBusinessRegistrationStoreSnapshot,
  ): ReadonlyArray<NonNullable<AiBusinessRegistration['parameterPayloadProviders']>[number]> {
    return typeof (source as { readonly getFunctions?: unknown }).getFunctions === 'function'
      ? (source as AiBusinessRegistration).parameterPayloadProviders ?? []
      : []
  }

  private static moduleSourceFromBusiness(
    source: AiBusinessRegistration | AiBusinessRegistrationData | AiBusinessRegistrationStoreSnapshot,
  ): AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot {
    if (typeof (source as { readonly getFunctions?: unknown }).getFunctions === 'function') {
      return AiRegistrationRepository.businessToModuleRegistration(source as AiBusinessRegistration)
    }
    if (AiRegistrationRepository.isBusinessStoreSnapshot(source)) {
      return {
        rootModulePath: source.rootModulePath,
        modules: source.modules,
        functions: source.functions,
        usageRules: source.usageRules,
        failureModes: source.failureModes,
      }
    }
    if (AiRegistrationRepository.isBusinessRegistrationData(source)) return AiRegistrationRepository.businessDataToModuleData(source)
    return AiRegistrationRepository.businessToModuleRegistration(source)
  }

  private static isBusinessRegistrationData(source: unknown): source is AiBusinessRegistrationData {
    return typeof source === 'object'
      && source !== null
      && typeof (source as { readonly getFunctions?: unknown }).getFunctions !== 'function'
      && typeof (source as { readonly businessId?: unknown }).businessId === 'string'
      && Array.isArray((source as { readonly functions?: unknown }).functions)
      && Array.isArray((source as { readonly modules?: unknown }).modules)
  }

  private static isBusinessStoreSnapshot(source: unknown): source is AiBusinessRegistrationStoreSnapshot {
    return typeof source === 'object'
      && source !== null
      && typeof (source as { readonly rootBusinessPath?: unknown }).rootBusinessPath === 'string'
      && typeof (source as { readonly rootModulePath?: unknown }).rootModulePath === 'string'
      && Array.isArray((source as { readonly modules?: unknown }).modules)
      && Array.isArray((source as { readonly functions?: unknown }).functions)
  }

  private static businessToModuleRegistration(business: AiBusinessRegistration): AiModuleRegistration {
    return {
      moduleId: business.businessId,
      name: business.name,
      description: business.description,
      ...(business.prompt === undefined ? {} : { prompt: business.prompt }),
      ...(business.modules === undefined ? {} : { modules: business.modules }),
      ...(business.instanceParam === undefined ? {} : { instanceParam: business.instanceParam }),
      getFunctions: () => business.getFunctions(),
    }
  }

  private static moduleToBusinessRegistration(module: AiModuleRegistration): AiBusinessRegistration {
    return {
      businessId: module.moduleId,
      name: module.name,
      description: module.description,
      ...(module.prompt === undefined ? {} : { prompt: module.prompt }),
      ...(module.modules === undefined ? {} : { modules: module.modules }),
      ...(module.instanceParam === undefined ? {} : { instanceParam: module.instanceParam }),
      getFunctions: () => module.getFunctions(),
    }
  }

  private static businessDataToModuleData(data: AiBusinessRegistrationData): AiModuleRegistrationData {
    return {
      moduleId: data.businessId,
      name: data.name,
      description: data.description,
      ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
      ...(data.instanceParam === undefined ? {} : { instanceParam: data.instanceParam }),
      functions: data.functions,
      modules: data.modules,
    }
  }

  private static moduleDataToBusinessData(data: AiModuleRegistrationData): AiBusinessRegistrationData {
    return {
      businessId: data.moduleId,
      name: data.name,
      description: data.description,
      ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
      ...(data.instanceParam === undefined ? {} : { instanceParam: data.instanceParam }),
      functions: data.functions,
      modules: data.modules,
    }
  }

  private static moduleStoreToBusinessStoreSnapshot(snapshot: AiModuleRegistrationStoreSnapshot): AiBusinessRegistrationStoreSnapshot {
    return {
      rootBusinessPath: snapshot.rootModulePath,
      ...snapshot,
    }
  }
}
