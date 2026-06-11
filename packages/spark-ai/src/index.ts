/**
 * @packageDocumentation
 *
 * SPARK AI root facade.
 *
 * Use the focused public entries for new code:
 * - `@spark-appworks/spark-ai/json`
 * - `@spark-appworks/spark-ai/class-model`
 * - `@spark-appworks/spark-ai/agent`
 */

export {
  AiJsonSchemaValidator,
  noParamsSchema,
  paramsSchema,
} from './json'

export {
  ClassModelRuntime,
} from './class-model'

export type {
  AiModuleMetadataJson,
  ClassModelDocument,
  ClassModelKnowledgeProvider,
} from './class-model'

export {
  DefaultAiAgentSessionStore,
  createAiAgentHost,
  startAiAgentRegistrationSession,
} from './agent'
