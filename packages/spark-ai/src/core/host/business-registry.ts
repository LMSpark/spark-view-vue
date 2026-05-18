/**
 * 业务注册表。
 */

import type {
  AiHostBusinessRuntime,
  AiHostRoutingCandidate,
  AiModuleRegistrationData,
  IBusinessRegistrationData,
} from './types'

function collectFunctions(data: AiModuleRegistrationData): AiHostRoutingCandidate['functions'] {
  return [
    ...data.functions.map((fn) => ({
      functionId: fn.functionId,
      description: fn.description,
    })),
    ...data.modules.flatMap((child) => collectFunctions(child)),
  ]
}

export function createAiHostRoutingCandidateFromRegistration(data: AiModuleRegistrationData): AiHostRoutingCandidate {
  return {
    moduleId: data.moduleId,
    name: data.name,
    description: data.description,
    ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
    functions: collectFunctions(data),
  }
}

export function createAiHostRoutingCandidateFromBusiness(data: IBusinessRegistrationData): AiHostRoutingCandidate {
  return {
    moduleId: data.businessId,
    name: data.name,
    description: data.description,
    ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
    functions: collectFunctions({
      moduleId: data.businessId,
      name: data.name,
      description: data.description,
      ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
      ...(data.instanceParam === undefined ? {} : { instanceParam: data.instanceParam }),
      functions: data.functions,
      modules: data.modules,
    }),
  }
}

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

  routingCandidates(): readonly AiHostRoutingCandidate[] {
    return this.list().map((runtime) => {
      const businessData = runtime.getBusinessRegistrationData?.()
      return businessData === undefined
        ? createAiHostRoutingCandidateFromRegistration(runtime.getRegistrationData())
        : createAiHostRoutingCandidateFromBusiness(businessData)
    })
  }
}
