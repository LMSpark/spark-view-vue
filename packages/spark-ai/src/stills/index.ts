/**
 * Stills — barrel export & registerAll
 *
 * 31 stills 覆盖 P0→P5 全部 action（P6 rule / P7 page 为未来阶段）
 */

// ── core types ─────────────────────────────────────────────
import { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill } from './dispatcher'
export { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill }
import type {
  StillGuard,
  StillResult,
  StillDefinition,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  PatchEntry,
  IStillSession,
  DomainProvider,
} from './types'
export type {
  StillGuard,
  StillResult,
  StillDefinition,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  PatchEntry,
  IStillSession,
  DomainProvider,
}
export { noGuard, requireBlueprint } from './types'

// ── domain infrastructure ──────────────────────────────────
export { registerDomain, getDomain, clearDomains, createSession } from './domain'

// ── dataset domain ─────────────────────────────────────────
export { datasetDomain, getDataSetSlot } from './dataset-domain'
export type { DataSetSlot, DesignStep } from './dataset-domain'
export {
  datasetInit, datasetDescribe, datasetValidate, datasetExport, datasetReset,
  datatableCreate, datatableDescribe, datatableAddColumns, datatableUpdateColumn,
  datatableRemoveColumn, datatableSetApi, datatableAddRows,
  relationAdd, relationRemove, relationList,
  schemaLock, schemaUnlock,
  dataviewCreate, dataviewDescribe, dataviewConfigure, dataviewSetAggregates, dataviewSetTreeConfig,
  dependencyAdd, dependencyRemove,
} from './dataset-domain'

// ── framework stills (domain-agnostic) ─────────────────────
export { stillsCapabilities, stillsActionSpec, sessionDescribe } from './meta-methods'
export { blueprintCreate, blueprintDescribe, blueprintAdvance, blueprintRevise } from './blueprint-methods'

// ── registerAllStills ──────────────────────────────────────

import { registerDomain } from './domain'
import { datasetDomain } from './dataset-domain'

import { stillsCapabilities, stillsActionSpec, sessionDescribe } from './meta-methods'
import { blueprintCreate, blueprintDescribe, blueprintAdvance, blueprintRevise } from './blueprint-methods'

/** 7 个框架级 stills（不属于任何 domain） */
const frameworkStills = [
  stillsCapabilities,
  stillsActionSpec,
  sessionDescribe,
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintRevise,
]

/**
 * 注册全部 31 个 stills 到全局 registry。
 * - dataset domain（24 stills）通过 registerDomain 注册
 * - 框架级 stills（7）通过 registerAll 注册
 */
export function registerAllStills(): void {
  registerDomain(datasetDomain)
  registerAll(frameworkStills as unknown as StillDefinition[])
}
