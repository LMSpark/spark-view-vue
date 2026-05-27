/**
 * @packageDocumentation
 *
 * SPARK AI root facade.
 *
 * Use the focused public entries for new code:
 * - `@spark-view/spark-ai/json`
 * - `@spark-view/spark-ai/modules`
 * - `@spark-view/spark-ai/agent`
 */

export {
  AiJsonSchemaValidator,
  noParamsSchema,
  paramsSchema,
} from './json'

export type {
  AiJsonObject,
  AiJsonParamShape,
  AiJsonParams,
  AiJsonSchema,
  AiJsonSchemaObject,
  AiJsonSchemaType,
  AiJsonValue,
} from './json'

export {
  AiModule,
  AiModuleCheck,
  AiModulePath,
  AiModuleResult,
  AiModuleRuntime,
} from './modules'

export type {
  AiModuleFunctionMetadata,
  AiModuleHostContext,
  AiModuleInstanceRef,
  AiModuleOptions,
  AiModulePathContext,
  AiModuleToolSpec,
} from './modules'

export {
  AI_AGENT_HOST,
  AiAgentHost,
  AiAgentRegistration,
  AiAgentSession,
  AiAgentSessionStore,
  DefaultAiAgentSessionStore,
  createAiAgentHost,
  createAiAgentRegistration,
  runAiAgent,
  startAiAgentRegistrationSession,
} from './agent'

export type {
  AiAgentDefinition,
  AiAgentFunctionCallResult,
  AiAgentHostEntryMap,
  AiAgentHostRunResult,
  AiAgentRegistrationOptions,
  AiAgentRuntimeContext,
  AiAgentSessionRecord,
  AiAgentSessionSummary,
  AiAgentSessionTranscriptEntry,
  AiAgentTaskChatOptions,
  AiAgentTurnCallbacks,
  CreateAiAgentHostOptions,
} from './agent'
