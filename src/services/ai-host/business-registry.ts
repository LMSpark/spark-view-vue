import type {
  IBusinessRegistrationData,
  AiModuleRegistrationData,
} from '@spark-view/spark-ai'
import type {
  AppAiBusinessRuntime,
  AppAiRoutingCandidate,
} from './types'

function collectFunctions(data: AiModuleRegistrationData): AppAiRoutingCandidate['functions'] {
  return [
    ...data.functions.map((fn) => ({
      functionId: fn.functionId,
      description: fn.description,
    })),
    ...data.modules.flatMap((child) => collectFunctions(child)),
  ]
}

export function createRoutingCandidateFromRegistration(data: AiModuleRegistrationData): AppAiRoutingCandidate {
  return {
    moduleId: data.moduleId,
    name: data.name,
    description: data.description,
    ...(data.prompt === undefined ? {} : { prompt: data.prompt }),
    functions: collectFunctions(data),
  }
}

export function createRoutingCandidateFromBusinessRegistration(data: IBusinessRegistrationData): AppAiRoutingCandidate {
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

export class AppAiBusinessRegistry {
  private readonly runtimes = new Map<string, AppAiBusinessRuntime>()

  register(runtime: AppAiBusinessRuntime): void {
    if (this.runtimes.has(runtime.moduleId)) {
      throw new Error(`Duplicate APP AI business runtime: ${runtime.moduleId}`)
    }
    this.runtimes.set(runtime.moduleId, runtime)
  }

  get(moduleId: string): AppAiBusinessRuntime | undefined {
    return this.runtimes.get(moduleId)
  }

  list(): readonly AppAiBusinessRuntime[] {
    return Array.from(this.runtimes.values())
  }

  routingCandidates(): readonly AppAiRoutingCandidate[] {
    return this.list().map((runtime) => {
      const businessData = runtime.getBusinessRegistrationData?.()
      return businessData === undefined
        ? createRoutingCandidateFromRegistration(runtime.getRegistrationData())
        : createRoutingCandidateFromBusinessRegistration(businessData)
    })
  }
}
