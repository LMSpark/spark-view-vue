/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-bundle-types
 * 职责：定义 DTS ClassModel bundle、per-file projection、module semantic metadata、duplicate record 和 semantic gap report 的持久化协议。
 * 边界：只维护 JSON 结构契约，不读取文件系统、不执行 TypeScript 投影，也不渲染知识提示词。
 * AI用途：修改 generated/dts-class-model 协议或消费 manifest/shard 时，用本模块确认字段含义和协议边界。
 */
import type {
  ClassModel,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  MethodParameterStyle,
  SourceProvenanceMeta,
} from './types'
import type { AiJsonSchema, AiJsonSchemaObject } from '../../json'

export const DTS_FILE_PROJECTION_VERSION = 1 as const
export const DTS_CLASS_MODEL_BUNDLE_PROTOCOL = 'spark-appworks.dts-class-model.bundle' as const
export const DTS_CLASS_MODEL_BUNDLE_VERSION = 1 as const
export const DTS_CLASS_MODEL_RUNTIME_PROTOCOL = 'spark-appworks.dts-class-model.runtime' as const
export const DTS_CLASS_MODEL_RUNTIME_VERSION = 1 as const

/** Dts File Projection Document 的语义模型。 */
export type DtsFileProjectionDocument = Readonly<{
  schemaVersion: typeof DTS_FILE_PROJECTION_VERSION
  sourcePath: string
  module: DtsFileModuleSemanticMeta
  symbols: readonly string[]
  $defs?: Readonly<Record<string, AiJsonSchemaObject>>
  models: Readonly<Record<string, ClassModel>>
  generatedAt?: string
}>

/** Dts File Module JsDoc Source 标记模块语义来自源码注释还是路径推导。 */
export type DtsFileModuleJsDocSource =
  | 'leading-jsdoc'
  | 'source-file-jsdoc'
  | 'inferred'

/** Dts File Module Semantic Meta 描述单个 DTS shard 的模块级入口语义。 */
export type DtsFileModuleSemanticMeta = Readonly<{
  name: string
  sourcePath: string
  sourceFile: string
  packageName?: string
  modulePath: string
  jsdoc: string
  jsdocSource: DtsFileModuleJsDocSource
  symbols: readonly string[]
  componentName?: string
  componentType?: string
  componentLevel?: ComponentClassModelLevel
  componentLayer?: ComponentClassModelLayer
  componentDirectory?: string
}>

/** Dts Class Model Bundle File Entry 的语义模型。 */
export type DtsClassModelBundleFileEntry = Readonly<{
  file: string
  module: DtsFileModuleSemanticMeta
}>

/** Dts Class Model Bundle Class Entry 的语义模型。 */
export type DtsClassModelBundleClassEntry = Readonly<{
  sourcePath: string
  file: string
}>

/** Dts Class Model Bundle Manifest 的语义模型。 */
export type DtsClassModelBundleManifest = Readonly<{
  schemaVersion: typeof DTS_CLASS_MODEL_BUNDLE_VERSION
  protocol: typeof DTS_CLASS_MODEL_BUNDLE_PROTOCOL
  generatedAt: string
  scannedFileCount: number
  files: Readonly<Record<string, DtsClassModelBundleFileEntry>>
  classIndex: Readonly<Record<string, DtsClassModelBundleClassEntry>>
  duplicates?: readonly DtsClassModelDuplicateRecord[]
}>

/** Dts Class Model Runtime File Entry 的语义模型。 */
export type DtsClassModelRuntimeFileEntry = Readonly<{
  file: string
  symbols: readonly string[]
}>

/** Dts Class Model Runtime Class Entry 的语义模型。 */
export type DtsClassModelRuntimeClassEntry = Readonly<{
  sourcePath: string
  file: string
  modelRef: string
  schemaRef: string
}>

/** Dts Class Model Runtime Ref Entry 的语义模型。 */
export type DtsClassModelRuntimeRefEntry = Readonly<{
  file: string
}>

/** Dts Class Model Runtime Manifest 的语义模型。 */
export type DtsClassModelRuntimeManifest = Readonly<{
  schemaVersion: typeof DTS_CLASS_MODEL_RUNTIME_VERSION
  protocol: typeof DTS_CLASS_MODEL_RUNTIME_PROTOCOL
  files: Readonly<Record<string, DtsClassModelRuntimeFileEntry>>
  classIndex: Readonly<Record<string, DtsClassModelRuntimeClassEntry>>
  refIndex: Readonly<Record<string, DtsClassModelRuntimeRefEntry>>
}>

/** Dts Class Model Runtime Link Relation 的语义模型。 */
export type DtsClassModelRuntimeLinkRelation =
  | 'attribute'
  | 'method-parameter'
  | 'method-return'

/** Dts Class Model Runtime Link 的语义模型。 */
export type DtsClassModelRuntimeLink = Readonly<{
  ref: string
  kind: 'link'
  fromRef: string
  relation: DtsClassModelRuntimeLinkRelation
  targetModelRef: string
  targetClassName: string
  targetFile: string
  targetSchemaRef: string
}>

/** Dts Class Model Runtime Attribute 的语义模型。 */
export type DtsClassModelRuntimeAttribute = Readonly<{
  ref: string
  kind: 'attribute'
  ownerRef: string
  name: string
  schemaRef: string
  readable: boolean
  writable: boolean
}>

/** Dts Class Model Runtime Method 的语义模型。 */
export type DtsClassModelRuntimeMethod = Readonly<{
  ref: string
  kind: 'method'
  ownerRef: string
  name: string
  parameterStyle: MethodParameterStyle
  paramsSchemaRef: string
  returnSchemaRef?: string
}>

/** Dts Class Model Runtime Model 的语义模型。 */
export type DtsClassModelRuntimeModel = Readonly<{
  ref: string
  kind: 'model'
  className: string
  schemaRef: string
  attributeRefs: readonly string[]
  methodRefs: readonly string[]
  linkRefs: readonly string[]
}>

/** Dts Class Model Runtime Schema Ref 的语义模型。 */
export type DtsClassModelRuntimeSchemaRef = Readonly<{
  ref: string
  kind: 'schema'
  schema: AiJsonSchema
}>

/** Dts Class Model Runtime Ref 的语义模型。 */
export type DtsClassModelRuntimeRef =
  | DtsClassModelRuntimeModel
  | DtsClassModelRuntimeAttribute
  | DtsClassModelRuntimeMethod
  | DtsClassModelRuntimeSchemaRef
  | DtsClassModelRuntimeLink

/** Dts Class Model Runtime Shard 的语义模型。 */
export type DtsClassModelRuntimeShard = Readonly<{
  schemaVersion: typeof DTS_CLASS_MODEL_RUNTIME_VERSION
  protocol: typeof DTS_CLASS_MODEL_RUNTIME_PROTOCOL
  sourcePath: string
  symbols: readonly string[]
  '@refs': Readonly<Record<string, DtsClassModelRuntimeRef>>
}>

/** Dts Class Model Duplicate Record 的记录结构。 */
export type DtsClassModelDuplicateRecord = Readonly<{
  className: string
  keptFile: string
  skippedFile: string
}>

/** Dts Class Model Semantic Gap Kind 的语义模型。 */
export type DtsClassModelSemanticGapKind =
  | 'module'
  | 'model'
  | 'constructor'
  | 'attribute'
  | 'method'

/** Dts Class Model Semantic Gap 的语义模型。 */
export type DtsClassModelSemanticGap = Readonly<{
  kind: DtsClassModelSemanticGapKind
  className: string
  moduleName?: string
  memberName?: string
  reason: 'missing-jsdoc' | 'inferred-module-jsdoc' | 'weak-module-jsdoc'
  chainBreak: string
  fixHint: string
  declarationFile: string
  declarationLine: number
  sourceFile: string
  componentName?: string
  componentType?: string
  componentLevel?: ComponentClassModelLevel
  componentLayer?: ComponentClassModelLayer
  componentDirectory?: string
  declarationKind?: NonNullable<SourceProvenanceMeta['declarationKind']>
}>

/** Dts Class Model Semantic Gap Report 的语义模型。 */
export type DtsClassModelSemanticGapReport = Readonly<{
  generatedAt: string
  gapCount: number
  notes: readonly string[]
  gaps: readonly DtsClassModelSemanticGap[]
}>

/** Project Dts File Projection Options 的调用配置。 */
export type ProjectDtsFileProjectionOptions = Readonly<{
  repoRoot: string
  absolutePath: string
  exportedOnly?: boolean
}>
