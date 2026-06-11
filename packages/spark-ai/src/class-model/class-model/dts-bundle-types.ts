/**
 * @module @spark-appworks/spark-ai:class-model/class-model/dts-bundle-types
 * @spark-appworks/spark-ai 的 class-model/class-model/dts-bundle-types 模块。
 * 导出 ClassModel symbol: DtsFileProjectionDocument, DtsFileModuleJsDocSource, DtsFileModuleSemanticMeta, DtsClassModelBundleFileEntry, DtsClassModelBundleClassEntry, DtsClassModelBundleManifest, DtsClassModelDuplicateRecord, DtsClassModelSemanticGapKind 等（共 11 个 symbol）。
 */
import type {
  ClassModel,
  ComponentClassModelLayer,
  ComponentClassModelLevel,
  SourceProvenanceMeta,
} from './types'

export const DTS_FILE_PROJECTION_VERSION = 1 as const
export const DTS_CLASS_MODEL_BUNDLE_PROTOCOL = 'spark-appworks.dts-class-model.bundle' as const
export const DTS_CLASS_MODEL_BUNDLE_VERSION = 1 as const

/** Dts File Projection Document 的语义模型。 */
export type DtsFileProjectionDocument = Readonly<{
  schemaVersion: typeof DTS_FILE_PROJECTION_VERSION
  sourcePath: string
  module: DtsFileModuleSemanticMeta
  symbols: readonly string[]
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
  reason: 'missing-jsdoc' | 'inferred-module-jsdoc'
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
