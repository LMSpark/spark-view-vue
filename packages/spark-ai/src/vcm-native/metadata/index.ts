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

export {
  MODULE_METADATA_RUNTIME_JSON_SCHEMA,
  readModuleMetadataRuntimeDocument,
} from './module-metadata-runtime-document'

export type {
  ModuleMetadataRuntimeDocument,
} from './module-metadata-runtime-document'

export {
  assembleRuntimeDocumentFromBundle,
  assembleRuntimeModuleFromBundle,
  listManifestAttributeReachableKinds,
  listManifestKindIds,
  readVcmBundleManifest,
  readVcmKindMetadataFile,
} from './vcm-bundle-assembler'

export {
  compareVcmBundleWithMonolithicRuntime,
  loadVcmBundlePartsFromDist,
} from './vcm-bundle-parity'

export { VcmBundleLoader, resolveBundleRelativeUrl } from './vcm-bundle-loader'

export type { VcmBundleLoaderOptions } from './vcm-bundle-loader'

export type {
  VcmNativeJsonMetadata,
  VcmNativeSessionClass,
  VcmNativeSnapshotClass,
  VcmNativeSnapshotFactory,
} from './vcm-native-class-contract'

export type {
  ApiObjectValidationFinding,
} from './validate-api-object-metadata'
