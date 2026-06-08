export {
  CLASS_MODEL_DOCUMENT_VERSION,
} from './types'

export type {
  AttributeMeta,
  ChildModelLink,
  ClassModel,
  ClassModelDiagnostic,
  ClassModelDocument,
  ConstructorMeta,
  JsDocMeta,
  JsDocTagMeta,
  MethodMeta,
  SourceProvenanceMeta,
} from './types'

export {
  createClassModelDocumentFromModuleMetadata,
  createClassModelDocumentFromRuntimeDocument,
} from './from-runtime-metadata'

export {
  compareClassModelDocumentsForBuildConsistency,
} from './consistency'

export type {
  ClassModelBuildConsistencyIssue,
} from './consistency'

export {
  jsonSchemaToTypeText,
} from './json-schema-to-type'
