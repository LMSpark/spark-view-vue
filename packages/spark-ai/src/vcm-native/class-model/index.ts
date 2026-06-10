export {
  CLASS_MODEL_DOCUMENT_VERSION,
} from './types'

export type {
  AttributeMeta,
  ClassModel,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './types'

export {
  createClassModelDocumentFromModuleMetadata,
  createClassModelDocumentFromRuntimeDocument,
} from './from-runtime-metadata'

export {
  classNameForKind,
  collectModuleApiKinds,
  listAttributeReachableKinds,
  projectClassModelForGuide,
  projectClassModelFromApi,
  resolveModuleApi,
  resolveModuleApiOrUndefined,
} from './model-projection'

export {
  compareClassModelDocumentsForBuildConsistency,
} from './consistency'

export {
  auditClassModelReflectionConnectivity,
} from './reflection-connectivity'

export type {
  ClassModelBuildConsistencyIssue,
} from './consistency'

export type {
  ClassModelReflectionConnectivityIssue,
} from './reflection-connectivity'

export {
  jsonSchemaToTypeText,
} from './json-schema-to-type'

export {
  renderAttributeDeclarationLine,
  renderAttributeTypeText,
  renderConstructorSignature,
  renderMethodDeclarationLine,
  renderMethodParamsText,
  renderMethodReturnTypeText,
  renderMethodSignature,
} from './signature-renderer'
