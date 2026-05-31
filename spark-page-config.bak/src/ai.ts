/**
 * @spark-view/spark-page-config/ai
 *
 * AI 更新入口：按业务注册暴露 ProjectPlanning 和 PageDesign。
 */

export {
  PROJECT_PLANNING_AI_AGENT_HOST_ALIAS,
  PROJECT_PLANNING_MODULE_ID,
  createProjectPlanningBusinessKindDefinition,
  createProjectPlanningBusinessRegistration,
  ensureProjectPlanningBusiness,
} from './project/ai/project-planning-module'

export type {
  ProjectPlanningModuleOptions,
  ProjectPlanningRunInput,
  ProjectPlanningRunMode,
  ProjectPlanningRuntimeContext,
} from './project/ai/project-planning-module'

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
