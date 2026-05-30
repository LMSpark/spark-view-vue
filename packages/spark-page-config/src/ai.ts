/**
 * @spark-view/spark-page-config/ai
 *
 * PageNode AI 更新入口：只暴露业务注册、kind 常量和诊断工具。
 */

export {
  PAGE_DESIGN_AI_AGENT_HOST_ALIAS,
  PAGE_DESIGN_MODULE_ID,
  createPageDesignBusinessKindDefinition,
  createPageDesignBusinessRegistration,
  ensurePageDesignBusiness,
} from './page-model/ai/page-design-module'

export type {
  PageDesignAllowedOperations,
  PageDesignRunInput,
  PageDesignRunMode,
} from './page-model/ai/page-design-module'

export {
  PAGE_DESIGN_COMPONENT_PAYLOAD_REF,
  PAGE_DESIGN_DATASET_KIND,
  PAGE_DESIGN_LIFECYCLE_KIND,
  PAGE_DESIGN_NODE_TREE_KIND,
  PAGE_DESIGN_PAYLOAD_CATALOG_KIND,
  PAGE_DESIGN_ROOT_KIND,
  PAGE_DESIGN_STANDARD_PAGE_KIND,
  PAGE_DESIGN_TEXT_MODEL_KIND,
} from './page-model/ai/page-design-kind-ids'

export {
  componentTypesFromPageDesignRule,
  flattenPageDesignSparkNodes,
  guidedPageDesignPayloadKeysFromSession,
  parsePageDesignJsonFile,
  validatePageDesignPayloadGuidesFromSession,
} from './page-model/ai/page-design-session-diagnostics'

export type {
  PageDesignFileSnapshot,
  PageDesignPayloadGuideValidation,
} from './page-model/ai/page-design-session-diagnostics'
