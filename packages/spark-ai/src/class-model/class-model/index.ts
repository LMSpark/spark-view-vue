/**
 * @module @spark-appworks/spark-ai:class-model/class-model/index
 * 职责：维护 DTS ClassModel 知识链路中的 class-model 能力，围绕 模块入口、副作用注册或内部组合逻辑 提供声明投影、协议读取、知识查询或运行时适配。
 * 边界：只服务 .d.ts => JSON => guide 的知识索引链路，不直接执行业务页面逻辑。
 * AI用途：当需要判断 ClassModel 在 class-model/class-model/index 这一段如何生成、加载或投影时，用本模块定位职责。
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
  DtsTypeMeta,
  JsDocMeta,
  DtsReflectionSignature,
  DtsReflectionTypeMeta,
  MethodMeta,
  MethodParameterMeta,
  MethodParameterStyle,
  SourceProvenanceMeta,
} from './types'

export {
  createClassModelDocumentFromRuntimeApiMetadata,
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
  dtsSourcePathToBundleRelativeJson,
  resolveDtsBundleRelativeUrl,
} from './dts-bundle-url'

export {
  DtsClassModelBundleLoader,
} from './dts-class-model-bundle-loader'

export {
  DtsClassModelRuntimeLoader,
} from './dts-class-model-runtime-loader'

export {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_CLASS_MODEL_RUNTIME_PROTOCOL,
  DTS_CLASS_MODEL_RUNTIME_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from './dts-bundle-types'

export {
  DTS_CLASS_MODEL_SURFACE_VERSION,
} from './dts-surface-types'

export type {
  DtsClassModelBundleManifest,
  DtsClassModelBundleFileEntry,
  DtsClassModelRuntimeAttribute,
  DtsClassModelRuntimeClassEntry,
  DtsClassModelRuntimeFileEntry,
  DtsClassModelRuntimeLink,
  DtsClassModelRuntimeLinkRelation,
  DtsClassModelRuntimeManifest,
  DtsClassModelRuntimeMethod,
  DtsClassModelRuntimeModel,
  DtsClassModelRuntimeRef,
  DtsClassModelRuntimeRefEntry,
  DtsClassModelRuntimeSchemaRef,
  DtsClassModelRuntimeShard,
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
  DtsClassModelRuntimeLoaderOptions,
} from './dts-class-model-runtime-loader'

export type {
  DtsClassModelSurfaceDocument,
  ProjectDtsClassModelSurfaceOptions,
} from './dts-surface-types'

export {
  canRenderMethodSignatureFromTypeTree,
  collectDtsTypeReferenceNames,
  resolveMethodReturnType,
  visitDtsTypeMeta,
} from './dts-type-meta-ops'

export {
  renderAttributeDeclarationLine,
  renderAttributeTypeText,
  renderConstructorSignature,
  renderDtsTypeMeta,
  renderMethodDeclarationLine,
  renderMethodParameter,
  renderMethodParamsText,
  renderMethodReturnTypeLabel,
  renderMethodSignature,
  renderMethodSignatureFromMeta,
} from './signature-renderer'
