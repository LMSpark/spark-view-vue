/**
 * Stills
 *
 * 这个 barrel 负责两件事：
 * 1. 统一导出 still 引擎的核心 API；
 * 2. 提供 registerAllStills()，一次性完成框架 still 与 dataset domain 的注册。
 */

import { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill, findCandidateActions, scoreCandidateAction } from './dispatcher'
import type {
  DomainState,
  StillGuard,
  StillResult,
  StillFailureMode,
  StillDefinition,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  PatchEntry,
  IStillSession,
  DomainProvider,
  PostValidationWarning,
} from './types'
import { noGuard, requireBlueprint } from './types'
import { registerDomain, getDomain, clearDomains, createSession } from './domain'
import {
  datasetDomain,
  getDataSetState,
  datasetInit,
  datasetDescribe,
  datasetValidate,
  datasetExport,
  datasetReset,
  datatableCreate,
  datatableDescribe,
  datatableAddColumns,
  datatableUpdateColumn,
  datatableRemoveColumn,
  datatableSetApi,
  datatableAddRows,
  relationAdd,
  relationRemove,
  relationList,
  schemaLock,
  schemaUnlock,
  dataviewCreate,
  dataviewDescribe,
  dataviewConfigure,
  dataviewSetAggregates,
  dataviewSetTreeConfig,
  dependencyAdd,
  dependencyRemove,
} from './dataset-domain'
import type { DataSetDomainState, DesignPhase } from './dataset-domain'
import { stillsCapabilities, stillsActionSpec, sessionDescribe } from './meta-methods'
import {
  blueprintDomain,
  getBlueprintState,
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintItemAdvance,
  blueprintRevise,
  blueprintValidateCoverage,
  blueprintSelfCheck,
} from './blueprint-domain'
import type { BlueprintDomainState, BlueprintPhase } from './blueprint-domain'

// ═══════════════════════════════════════════════════════════
// Core Export
// ═══════════════════════════════════════════════════════════

export { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill, findCandidateActions, scoreCandidateAction }
export type {
  DomainState,
  StillGuard,
  StillResult,
  StillFailureMode,
  StillDefinition,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  PatchEntry,
  IStillSession,
  DomainProvider,
  PostValidationWarning,
}
export { noGuard, requireBlueprint }

// ═══════════════════════════════════════════════════════════
// Domain Infrastructure
// ═══════════════════════════════════════════════════════════

export { registerDomain, getDomain, clearDomains, createSession }

// ═══════════════════════════════════════════════════════════
// Dataset Domain
// ═══════════════════════════════════════════════════════════

export { datasetDomain, getDataSetState }
export type { DataSetDomainState, DesignPhase }
export {
  datasetInit,
  datasetDescribe,
  datasetValidate,
  datasetExport,
  datasetReset,
  datatableCreate,
  datatableDescribe,
  datatableAddColumns,
  datatableUpdateColumn,
  datatableRemoveColumn,
  datatableSetApi,
  datatableAddRows,
  relationAdd,
  relationRemove,
  relationList,
  schemaLock,
  schemaUnlock,
  dataviewCreate,
  dataviewDescribe,
  dataviewConfigure,
  dataviewSetAggregates,
  dataviewSetTreeConfig,
  dependencyAdd,
  dependencyRemove,
}

// ═══════════════════════════════════════════════════════════
// Framework Stills
// ═══════════════════════════════════════════════════════════

export { stillsCapabilities, stillsActionSpec, sessionDescribe }
export {
  blueprintDomain,
  getBlueprintState,
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintItemAdvance,
  blueprintRevise,
  blueprintValidateCoverage,
  blueprintSelfCheck,
}
export type { BlueprintDomainState, BlueprintPhase }

// ═══════════════════════════════════════════════════════════
// PageConfig Domain
// ═══════════════════════════════════════════════════════════

import { pageConfigDomain } from './pageconfig-domain'
export { pageConfigDomain }
export { getPageConfigState, createPageConfigState } from './pageconfig-types'
export type { PageConfigDomainState, PageConfigPhase, IPageConfigData, PageConfigExportResult, PageConfigValidationIssue } from './pageconfig-types'

// ═══════════════════════════════════════════════════════════
// Register All
// ═══════════════════════════════════════════════════════════

/**
 * 不隶属于任何业务 domain 的框架级 still（仅 meta 动作）。
 *
 * 蓝图动作已移入 blueprintDomain，通过 registerDomain 注册。
 */
const metaStills = [
  stillsCapabilities,
  stillsActionSpec,
  sessionDescribe,
] as const

/**
 * 注册全部 stills 到全局 registry。
 * - dataset domain（24 个）通过 registerDomain 注册；
 * - blueprint domain（7 个）通过 registerDomain 注册；
 * - pageconfig domain（18 个）通过 registerDomain 注册；
 * - meta stills（3 个）通过 registerAll 注册。
 */
export function registerAllStills(): void {
  registerDomain(datasetDomain)
  registerDomain(blueprintDomain)
  registerDomain(pageConfigDomain)
  registerAll(metaStills as unknown as StillDefinition[])
}
