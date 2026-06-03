/**
 * @packageDocumentation
 *
 * SPARK AI root facade.
 *
 * Use the focused public entries for new code:
 * - `@spark-appworks/spark-ai/json`
 * - `@spark-appworks/spark-ai/modules`
 * - `@spark-appworks/spark-ai/agent`
 */

export {
  AiJsonSchemaValidator,
  noParamsSchema,
  paramsSchema,
} from './json'

export {
  AiModule,
  AiModuleResult,
  AiModuleRuntime,
} from './modules'

export {
  DefaultAiAgentSessionStore,
  createAiAgentHost,
  createAiAgentRegistration,
  startAiAgentRegistrationSession,
} from './agent'
