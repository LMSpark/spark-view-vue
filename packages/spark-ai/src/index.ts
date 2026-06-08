/**
 * @packageDocumentation
 *
 * SPARK AI root facade.
 *
 * Use the focused public entries for new code:
 * - `@spark-appworks/spark-ai/json`
 * - `@spark-appworks/spark-ai/vcm-native`
 * - `@spark-appworks/spark-ai/agent`
 */

export {
  AiJsonSchemaValidator,
  noParamsSchema,
  paramsSchema,
} from './json'

export {
  VcmNativeRuntime,
} from './vcm-native'

export type {
  AiModuleMetadataJson,
  ClassModelDocument,
  ModuleMetadataRuntimeDocument,
  VcmNativeKnowledgeProvider,
} from './vcm-native'

export {
  DefaultAiAgentSessionStore,
  createAiAgentHost,
  createAiAgentRegistration,
  startAiAgentRegistrationSession,
} from './agent'
