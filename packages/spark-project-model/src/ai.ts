/**
 * @spark-view/spark-project-model/ai
 *
 * AI-facing contracts that are implemented by the project editor package.
 */

import type { AiAgentHost } from '@spark-view/spark-ai/agent'
import type { PageDesignEditHost } from './contract/edit-host.contract'

export const PAGE_DESIGN_MODULE_ID = 'pageDesign'

export type PageDesignRunMode = 'create' | 'update' | 'fix'

export type PageDesignAllowedOperations = {
  nodeTree?: boolean
  dataSet?: boolean
  script?: boolean
  style?: boolean
  navigation?: boolean
}

export type PageDesignRunInput = {
  description: string
  mode?: PageDesignRunMode
  allowedOperations?: PageDesignAllowedOperations
  preserveExistingInteractions?: boolean
}

export type EnsurePageDesignBusinessOptions = {
  host: AiAgentHost
  getPageDesignEditHost: (context: { moduleInstanceId: string }) => PageDesignEditHost
}

export function ensurePageDesignBusiness(options: EnsurePageDesignBusinessOptions): AiAgentHost {
  return options.host
}

export type {
  PageDesignEditHost,
  PageDesignEditPhase,
  PageDesignNodeTree,
} from './contract/edit-host.contract'

export {
  componentTypesFromPageDesignRule,
  flattenPageDesignSparkNodes,
  guidedPageDesignPayloadKeysFromSession,
  parsePageDesignJsonFile,
  validatePageDesignPayloadGuidesFromSession,
} from './ai/page-design/support'

export type {
  PageDesignFileSnapshot,
  PageDesignPayloadGuideValidation,
} from './ai/page-design/support'

export {
  PageDesignEditSession,
} from './ai/page-design/session'

export {
  pageDesignServiceFailure,
} from './ai/page-design/service'

export type {
  PageDesignServiceActionBinding,
  PageDesignServiceContext,
  PageDesignServiceOptions,
  PageDesignServiceResult,
  PageDesignTextFileKey,
} from './ai/page-design/service'
