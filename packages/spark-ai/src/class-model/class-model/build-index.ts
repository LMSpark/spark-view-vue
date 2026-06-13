/**
 * @module @spark-appworks/spark-ai:class-model/class-model/build-index
 * 职责：DTS ClassModel 编译期入口（Node + typescript）；不得被浏览器 / Worker 引用。
 */
export {
  buildDtsClassModelBundle,
  dtsSourcePathToBundleRelativeJson,
  resolveDtsBundleRelativeUrl,
} from './build-dts-class-model-bundle'

export {
  projectDtsClassModelSurface,
  projectDtsFileProjection,
  resolveDtsClassModel,
} from './project-from-declarations'

export {
  CLASS_MODEL_EMIT_PREFIX,
  CLASS_MODEL_EMIT_SOURCE,
  CLASS_MODEL_EMIT_TSCONFIG,
  isClassModelEmitPath,
  sourceFileFromEmitPath,
  toClassModelEmitPath,
} from './class-model-emit-path'

export {
  normalizeRepoPath,
  resolveAliasedSymbol,
  declarationNameText,
} from './dts-ast-utils'

export {
  cleanJsDocBlock,
  cleanVueModuleComment,
  readJsDoc,
} from './dts-jsdoc-reader'

export type {
  BuildDtsClassModelBundleOptions,
  BuildDtsClassModelBundleProgress,
  BuildDtsClassModelBundleProgressPhase,
  BuildDtsClassModelBundleResult,
} from './build-dts-class-model-bundle'
