export type {
  AiApiActionAntiExample,
  AiApiActionExample,
  AiApiActionFailureMode,
  AiApiActionMetadata,
  AiApiAttributeMetadata,
  AiApiConstructorMetadata,
  AiApiJsDocMetadata,
  AiApiObjectMetadata,
  AiApiResultApiRef,
  AiApiSourceProvenanceMetadata,
  AiModuleMetadataJson,
} from './ai-api-object-metadata-schema'

export {
  AiApiObjectMetadataValidationError,
  validateApiObjectMetadata,
} from './validate-api-object-metadata'

export { resolveModuleMetadataJson } from './resolve-api-object-metadata'

export {
  collectNestedApiRecords,
  walkAiApiMetadataGraph,
} from './metadata-graph'

export type {
  AiApiMetadataGraphEdge,
  AiApiMetadataGraphNode,
  AiApiNestedApiRecord,
} from './metadata-graph'

export type {
  ApiObjectValidationFinding,
} from './validate-api-object-metadata'
