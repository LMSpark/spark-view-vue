/**
 * @spark-view/spark-page-config
 *
 * 公共入口只暴露页面模型体系。底层 loader/parser/file API 是包内实现细节。
 */

export {
  PAGE_MODEL_FILE_NAMES,
  PageModel,
} from './editor/page-model'

export {
  PageEditor,
  componentCatalog,
  createPageEditor,
  PAGE_DATA_JSON_SCHEMA,
} from './editor/page-editor'

export * as JsonDocumentRuntime from './json-document'

export type {
  DirtyPart,
  PageModelCreateMountedParams,
  PageModelCreateMountedResult,
  PageModelCreatePageParams,
  PageModelFileName,
  PageModelFileVersionSummary,
  PageModelLike,
  PageModelLoadOptions,
  PageModelMountParams,
  PageModelNavigationDraft,
  PageModelPageSummary,
  PageModelRemoveMountedParams,
  PageModelRemoveMountedResult,
  PageModelRenderConfig,
} from './editor/page-model'

export {
  PageModelFactory,
  createPageModel,
  createPageModelFactory,
} from './editor/page-model-factory'

export type {
  PageModelFactoryLike,
  PageModelFactoryOptions,
  PageModelFileStorage,
} from './editor/page-model-factory'

export type {
  CreatePageEditorOptions,
  PageDesignEditHost,
  PageEditorLoadOptions,
  PageEditorSnapshot,
} from './editor/page-editor'
