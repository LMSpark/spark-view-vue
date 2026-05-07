export {
  PAGE_DESIGN_BUSINESS,
  createPageDesignBusinessRegistration,
  createPageDesignBusinessDefinition,
} from './page-design-business'

export type {
  CreatePageDesignBusinessRegistrationOptions,
  CreatePageDesignBusinessDefinitionOptions,
  PageDesignBusinessDefinition,
  PageDesignRuntimeContext,
  PageDesignServiceState,
} from './page-design-business'

export { PAGE_DESIGN_EDIT_RUNTIME_PROMPT } from './prompts/edit-runtime-prompt'

export {
  createEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
  isEditTextModelWriteAction,
} from './functions'

export type { EditState, EditToolHost, PageDesignNodeTree } from './functions'

export interface PageDesignBusinessContext {
  pageId?: string
  pageName?: string
  phase?: string
}

export {
  createPageCache,
  type PageCacheHandle,
} from './page-cache'
