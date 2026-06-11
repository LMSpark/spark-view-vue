/**
 * @module @spark-appworks/spark-ai:class-model/class-model/index
 * @spark-appworks/spark-ai 的 class-model/class-model/index 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
export {
  CLASS_MODEL_DOCUMENT_VERSION,
} from './types'

export type {
  AttributeMeta,
  ClassModel,
  ClassModelDeclarationRelation,
  ClassModelDeclarationRelationKind,
  ClassModelDocument,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
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
  BuildDtsClassModelBundleProgress,
  BuildDtsClassModelBundleProgressPhase,
  BuildDtsClassModelBundleResult,
} from './build-dts-class-model-bundle'

export type {
  DtsClassModelBundleManifest,
  DtsClassModelBundleFileEntry,
  DtsClassModelSemanticGap,
  DtsClassModelSemanticGapKind,
  DtsClassModelSemanticGapReport,
  DtsFileModuleJsDocSource,
  DtsFileModuleSemanticMeta,
  DtsFileProjectionDocument,
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
