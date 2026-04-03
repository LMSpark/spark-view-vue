/**
 * Stills
 *
 * 这个 barrel 负责两件事：
 * 1. 统一导出 still 引擎的核心 API；
 * 2. 提供 registerAllStills()，一次性完成框架 still 与 dataset domain 的注册。
 */

import { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill } from './dispatcher'
import type {
  StillGuard,
  StillResult,
  StillDefinition,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  PatchEntry,
  IStillSession,
  DomainProvider,
} from './types'
import { noGuard, requireBlueprint } from './types'
import { registerDomain, getDomain, clearDomains, createSession } from './domain'
import {
  datasetDomain,
  getDataSetSlot,
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
import type { DataSetSlot, DesignStep } from './dataset-domain'
import { stillsCapabilities, stillsActionSpec, sessionDescribe } from './meta-methods'
import { blueprintCreate, blueprintDescribe, blueprintAdvance, blueprintItemAdvance, blueprintRevise } from './blueprint-methods'

// ═══════════════════════════════════════════════════════════
// Core Export
// ═══════════════════════════════════════════════════════════

export { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill }
export type {
  StillGuard,
  StillResult,
  StillDefinition,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  PatchEntry,
  IStillSession,
  DomainProvider,
}
export { noGuard, requireBlueprint }

// ═══════════════════════════════════════════════════════════
// Domain Infrastructure
// ═══════════════════════════════════════════════════════════

export { registerDomain, getDomain, clearDomains, createSession }

// ═══════════════════════════════════════════════════════════
// Dataset Domain
// ═══════════════════════════════════════════════════════════

export { datasetDomain, getDataSetSlot }
export type { DataSetSlot, DesignStep }
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
export { blueprintCreate, blueprintDescribe, blueprintAdvance, blueprintItemAdvance, blueprintRevise }

// ═══════════════════════════════════════════════════════════
// Register All
// ═══════════════════════════════════════════════════════════

/**
 * 不隶属于任何业务 domain 的框架级 still。
 *
 * 这里保留原始异构 still 元组；注册时再做一次受控类型擦除，
 * 避免 StillDefinition<TParams> 的逆变参数把数组类型逼成一长串联合类型。
 */
const frameworkStills = [
  stillsCapabilities,
  stillsActionSpec,
  sessionDescribe,
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintItemAdvance,
  blueprintRevise,
] as const

/**
 * 注册全部 32 个 stills 到全局 registry。
 * - dataset domain（24 个）通过 registerDomain 注册；
 * - 框架级 stills（8 个）通过 registerAll 注册。
 */
export function registerAllStills(): void {
  registerDomain(datasetDomain)
  registerAll(frameworkStills as unknown as StillDefinition[])
}
