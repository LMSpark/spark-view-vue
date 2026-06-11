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
  buildDtsClassModelBundle,
  dtsSourcePathToBundleRelativeJson,
  resolveDtsBundleRelativeUrl,
} from './build-dts-class-model-bundle'

export {
  DtsClassModelBundleLoader,
} from './dts-class-model-bundle-loader'

export {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from './dts-bundle-types'

export {
  DTS_CLASS_MODEL_SURFACE_VERSION,
} from './dts-surface-types'

export {
  projectDtsClassModelSurface,
  projectDtsFileProjection,
  resolveDtsClassModel,
} from './project-from-declarations'

export type {
  BuildDtsClassModelBundleOptions,
  BuildDtsClassModelBundleResult,
} from './build-dts-class-model-bundle'

export type {
  DtsClassModelBundleClassEntry,
  DtsClassModelBundleFileEntry,
  DtsClassModelBundleManifest,
  DtsFileProjectionDocument,
  ProjectDtsFileProjectionOptions,
} from './dts-bundle-types'

export type {
  DtsClassModelBundleLoaderOptions,
} from './dts-class-model-bundle-loader'

export type {
  DtsClassModelSurfaceDocument,
  ProjectDtsClassModelSurfaceOptions,
} from './dts-surface-types'

export {
  renderAttributeDeclarationLine,
  renderAttributeTypeText,
  renderConstructorSignature,
  renderMethodDeclarationLine,
  renderMethodParamsText,
  renderMethodReturnTypeText,
  renderMethodSignature,
} from './signature-renderer'
