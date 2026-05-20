import type {
  AiModuleRegistration,
  AiRuntimeFunctionCallResult,
  AiRuntimeFunctionResultMessage,
  AiRuntimeKnowledgeProjection,
} from '../../protocol/runtime-contracts'
import type {
  AiRuntimeModuleId,
  AiRuntimeModuleInstanceId,
} from '../../protocol/business-registration'
import type {
  AiRegisteredModuleAppendFunctionCallOptions,
  AiRegisteredModuleAppendMessageOptions,
  AiRegisteredModuleCompleteFunctionCallOptions,
  AiRegisteredModuleExecuteFunctionCallOptions,
  AiRegisteredModuleProjectKnowledgeOptions,
  AiRegisteredModuleRecordFunctionCallRequestOptions,
  AiRegisteredModuleStartSessionOptions,
  AiRegisteredModuleStopSessionOptions,
  AiRegisteredModuleTranslateFunctionCallOptions,
  AiRuntimeCreateFunctionResultMessageOptions,
  AiRuntimeFunctionCallTranslationResult,
} from '../../protocol/runtime-protocol'
import type {
  AiRuntimeFunctionCallHistoryEntry,
  AiRuntimeHistoryEntry,
  AiRuntimeMessageHistoryEntry,
  AiRuntimeSessionRecord,
  AiRuntimeStartSessionResult,
  AiRuntimeStopSessionResult,
} from '../../protocol/session-events'
import type { AiRegistrationRepository } from './ai-registration-repository'
import type { AiSessionLedger } from './ai-session-ledger'
import type { AiProjectionService } from './ai-projection-service'
import type { AiFunctionCallTranslator } from './ai-function-call-translator'
import type { AiFunctionCallExecutor } from './ai-function-call-executor'

export class AiRegisteredModule {
  readonly moduleId: AiRuntimeModuleId

  readonly registration: AiModuleRegistration

  constructor(
    private readonly registrations: AiRegistrationRepository,
    private readonly sessions: AiSessionLedger,
    private readonly projections: AiProjectionService,
    private readonly translator: AiFunctionCallTranslator,
    private readonly executor: AiFunctionCallExecutor,
    registration: AiModuleRegistration,
  ) {
    this.registration = registration
    this.moduleId = registration.moduleId
  }

  getRegistration(): AiModuleRegistration {
    return this.registrations.getModuleOrThrow(this.moduleId)
  }

  getSession(moduleInstanceId: AiRuntimeModuleInstanceId): AiRuntimeSessionRecord | null {
    return this.sessions.getSession(this.moduleId, moduleInstanceId)
  }

  listSessions(): readonly AiRuntimeSessionRecord[] {
    return this.sessions.listSessions(this.moduleId)
  }

  getSessionHistory(moduleInstanceId: AiRuntimeModuleInstanceId): readonly AiRuntimeHistoryEntry[] {
    return this.sessions.getSessionHistory(this.moduleId, moduleInstanceId)
  }

  appendMessage(options: AiRegisteredModuleAppendMessageOptions): AiRuntimeMessageHistoryEntry {
    return this.sessions.appendMessage({ ...options, moduleId: this.moduleId })
  }

  recordFunctionCallRequest(
    options: AiRegisteredModuleRecordFunctionCallRequestOptions,
  ): AiRuntimeFunctionCallHistoryEntry {
    return this.sessions.recordFunctionCallRequest({ ...options, moduleId: this.moduleId })
  }

  completeFunctionCall(
    options: AiRegisteredModuleCompleteFunctionCallOptions,
  ): AiRuntimeFunctionCallHistoryEntry {
    return this.sessions.completeFunctionCall({ ...options, moduleId: this.moduleId })
  }

  appendFunctionCall(options: AiRegisteredModuleAppendFunctionCallOptions): AiRuntimeFunctionCallHistoryEntry {
    return this.sessions.appendFunctionCall({ ...options, moduleId: this.moduleId })
  }

  async startSession(options: AiRegisteredModuleStartSessionOptions): Promise<AiRuntimeStartSessionResult> {
    this.getRegistration()
    const scope = this.sessions.prepareStartScope({ ...options, moduleId: this.moduleId })
    const projection = await this.projections.projectKnowledge(scope)
    return this.sessions.startSession(scope, projection, options.reason)
  }

  stopSession(options: AiRegisteredModuleStopSessionOptions): AiRuntimeStopSessionResult {
    this.getRegistration()
    return this.sessions.stopSession({ ...options, moduleId: this.moduleId })
  }

  projectKnowledge(options: AiRegisteredModuleProjectKnowledgeOptions): Promise<AiRuntimeKnowledgeProjection> {
    return this.projections.projectKnowledge({ ...options, moduleId: this.moduleId })
  }

  translateFunctionCall(
    options: AiRegisteredModuleTranslateFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallTranslationResult> {
    return this.translator.translateFunctionCall({ ...options, moduleId: this.moduleId })
  }

  executeFunctionCall(
    options: AiRegisteredModuleExecuteFunctionCallOptions,
  ): Promise<AiRuntimeFunctionCallResult<unknown>> {
    return this.executor.executeFunctionCall({ ...options, moduleId: this.moduleId })
  }

  createFunctionResultMessage(
    options: AiRuntimeCreateFunctionResultMessageOptions,
  ): AiRuntimeFunctionResultMessage {
    return this.executor.createFunctionResultMessage(options)
  }
}
