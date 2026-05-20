import type {
  AiModuleRegistration,
} from '../../protocol/runtime-contracts'
import type { AiRegistrationRepository } from './ai-registration-repository'
import type { AiSessionLedger } from './ai-session-ledger'
import type { AiProjectionService } from './ai-projection-service'
import type { AiFunctionCallTranslator } from './ai-function-call-translator'
import type { AiFunctionCallExecutor } from './ai-function-call-executor'
import { AiRegisteredModule } from './ai-registered-module'

export class AiRegisteredApiFactory {
  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projections: AiProjectionService,
    private readonly translator: AiFunctionCallTranslator,
    private readonly executor: AiFunctionCallExecutor,
  ) {}

  createRegisteredModuleApi(registration: AiModuleRegistration): AiRegisteredModule {
    return new AiRegisteredModule(
      this.registrations,
      this.sessions,
      this.projections,
      this.translator,
      this.executor,
      registration,
    )
  }

}
