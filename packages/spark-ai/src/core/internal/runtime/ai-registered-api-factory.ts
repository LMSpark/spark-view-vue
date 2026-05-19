import type {
  AiModuleRegistration,
  AiRegisteredModuleApi,
} from '../../protocol/runtime-contracts'
import type { AiRegistrationRepository } from './ai-registration-repository'
import type { AiSessionLedger } from './ai-session-ledger'
import type { AiProjectionService } from './ai-projection-service'
import type { AiFunctionCallTranslator } from './ai-function-call-translator'
import type { AiFunctionCallExecutor } from './ai-function-call-executor'

export class AiRegisteredApiFactory {
  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projections: AiProjectionService,
    private readonly translator: AiFunctionCallTranslator,
    private readonly executor: AiFunctionCallExecutor,
  ) {}

  createRegisteredModuleApi(registration: AiModuleRegistration): AiRegisteredModuleApi {
    const moduleId = registration.moduleId
    return {
      moduleId,
      registration,
      getRegistration: () => this.registrations.getModuleOrThrow(moduleId),
      getRegistrationData: () => this.registrations.getModuleRegistrationData(moduleId) ?? missingRegistrationData(moduleId),
      getRegistrationStoreSnapshot: () => this.registrations.getModuleRegistrationStoreSnapshot(moduleId) ?? missingRegistrationData(moduleId),
      getSession: (moduleInstanceId) => this.sessions.getSession(moduleId, moduleInstanceId),
      listSessions: () => this.sessions.listSessions(moduleId),
      getSessionHistory: (moduleInstanceId) => this.sessions.getSessionHistory(moduleId, moduleInstanceId),
      appendMessage: (options) => this.sessions.appendMessage({ ...options, moduleId }),
      recordFunctionCallRequest: (options) => this.sessions.recordFunctionCallRequest({ ...options, moduleId }),
      completeFunctionCall: (options) => this.sessions.completeFunctionCall({ ...options, moduleId }),
      appendFunctionCall: (options) => this.sessions.appendFunctionCall({ ...options, moduleId }),
      startSession: async (options) => {
        this.registrations.getModuleOrThrow(moduleId)
        const scope = this.sessions.prepareStartScope({ ...options, moduleId })
        const projection = await this.projections.projectKnowledge(scope)
        return this.sessions.startSession(scope, projection, options.reason)
      },
      stopSession: (options) => {
        this.registrations.getModuleOrThrow(moduleId)
        return this.sessions.stopSession({ ...options, moduleId })
      },
      projectKnowledge: (options) => this.projections.projectKnowledge({ ...options, moduleId }),
      translateFunctionCall: (options) => this.translator.translateFunctionCall({ ...options, moduleId }),
      executeFunctionCall: (options) => this.executor.executeFunctionCall({ ...options, moduleId }),
      createFunctionResultMessage: (options) => this.executor.createFunctionResultMessage(options),
    }
  }

}

function missingRegistrationData(moduleId: string): never {
  throw new Error(`Unknown AI module registration: ${moduleId}`)
}
