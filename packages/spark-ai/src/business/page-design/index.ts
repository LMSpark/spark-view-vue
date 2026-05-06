/**
 * 页面设计业务（Page Design）
 *
 * 新架构入口只声明业务定义：上层把该 definition 注册进 AiCore，
 * AI 会话宿主在 core 外自行负责模型通讯、tool 投影与多轮决策。
 */

export {
  PAGE_DESIGN_BUSINESS,
  createPageDesignBusinessDefinition,
} from './page-design-business'
export type {
  CreatePageDesignBusinessDefinitionOptions,
  PageDesignRuntimeContext,
  PageDesignModuleRuntime,
} from './page-design-business'

export { PAGE_DESIGN_EDIT_RUNTIME_PROMPT } from './prompts/edit-runtime-prompt'

export {
  createEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
} from './functions/lifecycle'
export type { EditState, EditToolHost } from './functions/lifecycle'

export {
  isEditWriteAction,
  isEditNodeTreeWriteAction,
  isEditDataSetWriteAction,
  isEditTextModelWriteAction,
} from './functions/edit/actions/edit-write-actions'

export interface PageDesignBusinessContext {
  pageId?: string
  pageName?: string
  phase?: string
}

export {
  createPageCache,
  type PageCacheHandle,
} from './page-cache'
