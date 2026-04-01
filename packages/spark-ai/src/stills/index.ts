/**
 * Stills — barrel export & registerAll
 *
 * 31 stills 覆盖 P0→P5 全部 action（P6 rule / P7 page 为未来阶段）
 */

export { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill } from './dispatcher'
export type {
  DesignStep,
  StillGuard,
  StillResult,
  StillContext,
  StillDefinition,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  PatchEntry,
  DesignSessionV2,
} from './types'
export { createSession, createEmptyDataset } from './types'
export { checkGuard } from './guards'

// ── method exports (for direct access) ─────────────────────

export { stillsCapabilities, stillsActionSpec, sessionDescribe } from './methods/meta-methods'
export { blueprintCreate, blueprintDescribe, blueprintAdvance, blueprintRevise } from './methods/blueprint-methods'
export { datasetInit, datasetDescribe, datasetValidate, datasetExport, datasetReset } from './methods/dataset-methods'
export {
  datatableCreate,
  datatableDescribe,
  datatableAddColumns,
  datatableUpdateColumn,
  datatableRemoveColumn,
  datatableSetApi,
  datatableAddRows,
} from './methods/datatable-methods'
export { relationAdd, relationRemove, relationList } from './methods/relation-methods'
export { schemaLock, schemaUnlock } from './methods/schema-methods'
export {
  dataviewCreate,
  dataviewDescribe,
  dataviewConfigure,
  dataviewSetAggregates,
  dataviewSetTreeConfig,
} from './methods/dataview-methods'
export { dependencyAdd, dependencyRemove } from './methods/dependency-methods'

// ── registerAllStills ──────────────────────────────────────

import { registerAll } from './dispatcher'
import type { StillDefinition } from './types'

import { stillsCapabilities, stillsActionSpec, sessionDescribe } from './methods/meta-methods'
import { blueprintCreate, blueprintDescribe, blueprintAdvance, blueprintRevise } from './methods/blueprint-methods'
import { datasetInit, datasetDescribe, datasetValidate, datasetExport, datasetReset } from './methods/dataset-methods'
import {
  datatableCreate,
  datatableDescribe,
  datatableAddColumns,
  datatableUpdateColumn,
  datatableRemoveColumn,
  datatableSetApi,
  datatableAddRows,
} from './methods/datatable-methods'
import { relationAdd, relationRemove, relationList } from './methods/relation-methods'
import { schemaLock, schemaUnlock } from './methods/schema-methods'
import {
  dataviewCreate,
  dataviewDescribe,
  dataviewConfigure,
  dataviewSetAggregates,
  dataviewSetTreeConfig,
} from './methods/dataview-methods'
import { dependencyAdd, dependencyRemove } from './methods/dependency-methods'

/** 全部 31 个 stills 定义列表 */
// StillDefinition<TParams> is invariant in TParams due to function parameter contravariance.
// Cast is safe: the dispatcher always passes `unknown` params to validate/execute.
const allStills = [
  // P0 meta (3)
  stillsCapabilities,
  stillsActionSpec,
  sessionDescribe,
  // P1 blueprint (4)
  blueprintCreate,
  blueprintDescribe,
  blueprintAdvance,
  blueprintRevise,
  // P2 dataset + datatable + relation (15)
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
  // P3 schema (2)
  schemaLock,
  schemaUnlock,
  // P4 dataview + dependency (7)
  dataviewCreate,
  dataviewDescribe,
  dataviewConfigure,
  dataviewSetAggregates,
  dataviewSetTreeConfig,
  dependencyAdd,
  dependencyRemove,
]

/**
 * 注册全部 31 个 stills 到全局 registry。
 * 应在 spark-ai 初始化时调用一次。
 */
export function registerAllStills(): void {
  registerAll(allStills as unknown as StillDefinition[])
}
