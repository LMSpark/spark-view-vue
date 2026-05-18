import type {
  IBusinessRegistration,
  IBusinessRegistrationData,
  IBusinessRegistrationStoreSnapshot,
  AiModuleRegistration,
  AiModuleRegistrationData,
  AiModuleRegistrationStoreSnapshot,
  AiRegisteredBusinessApi,
  AiRegisteredModuleApi,
  AiRuntimeApi,
  AiRuntimeOptions,
} from '../../protocol/runtime-contracts'
import { AiRuntimeProjector } from './ai-runtime-support'
import { AiRegistrationRepository } from './ai-registration-repository'
import { AiSessionLedger } from './ai-session-ledger'
import { AiProjectionService } from './ai-projection-service'
import { AiFunctionCallTranslator } from './ai-function-call-translator'
import { AiFunctionCallExecutor } from './ai-function-call-executor'
import { AiRegisteredApiFactory } from './ai-registered-api-factory'
import {
  actionOf,
  assertRuntimeId,
} from './runtime-utils'
import type { AiKnowledgeProjection } from '../knowledge/knowledge-projection'

/**
 * SPARK AI core composition root.
 *
 * AiRuntime now owns composition only:
 * - registration repository
 * - AI session ledger
 * - knowledge projection service
 * - function-call translator/executor
 * - registered module/business handle factory
 *
 * Session, projection, message, and function-call operations are intentionally
 * available only through the registered handle returned by registerModule or
 * registerBusiness. This keeps moduleId binding as the single public path and
 * prevents callers from bypassing the module registration boundary.
 */
export class AiRuntime implements AiRuntimeApi {
  private readonly projector = new AiRuntimeProjector(actionOf, assertRuntimeId)

  private readonly registrations = new AiRegistrationRepository(this.projector)

  private readonly sessions: AiSessionLedger

  private readonly projections: AiProjectionService

  private readonly translator: AiFunctionCallTranslator

  private readonly executor: AiFunctionCallExecutor

  private readonly apiFactory: AiRegisteredApiFactory

  constructor(options: AiRuntimeOptions = {}) {
    this.sessions = new AiSessionLedger(options)
    this.projections = new AiProjectionService(this.registrations, this.sessions, this.projector)
    this.translator = new AiFunctionCallTranslator(this.registrations, this.sessions, this.projections, this.projector)
    this.executor = new AiFunctionCallExecutor(this.sessions, this.translator)
    this.apiFactory = new AiRegisteredApiFactory(
      this.registrations,
      this.sessions,
      this.projections,
      this.translator,
      this.executor,
    )
  }

  registerBusiness(source: IBusinessRegistration | IBusinessRegistrationData | IBusinessRegistrationStoreSnapshot): AiRegisteredBusinessApi {
    const registration = this.registrations.registerBusiness(source)
    return this.apiFactory.createRegisteredBusinessApi(this.apiFactory.createRegisteredModuleApi(registration))
  }

  registerModule(source: AiModuleRegistration | AiModuleRegistrationData | AiModuleRegistrationStoreSnapshot): AiRegisteredModuleApi {
    const registration = this.registrations.registerModule(source)
    return this.apiFactory.createRegisteredModuleApi(registration)
  }

  getKnowledgeProjection(): AiKnowledgeProjection {
    return this.projections.getKnowledgeProjection()
  }
}
