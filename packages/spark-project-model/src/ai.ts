/**
 * @spark-appworks/spark-project-model/ai
 *
 * AI-facing contracts that are implemented by the project editor package.
 */

export {
  PAGE_DESIGN_MODULE_ID,
  ensurePageDesignBusiness,
} from './ai/page-design'

export type {
  PageDesignRunMode,
  PageDesignAllowedOperations,
  PageDesignRunInput,
  EnsurePageDesignBusinessOptions,
} from './ai/page-design'