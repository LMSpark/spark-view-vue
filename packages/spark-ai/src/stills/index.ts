import { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill } from '../core/stills/dispatcher'
import type {
  DomainState,
  StillGuard,
  StillResult,
  StillDefinition,
  PatchEntry,
  IStillSession,
  DomainProvider,
  PostValidationWarning,
} from '../core/stills/types'
import { noGuard } from '../core/stills/types'
import {
  registerDomain,
  getDomain,
  clearDomains,
  type CreateSessionOptions,
} from '../core/stills/domain'
import { createStillsSession } from '../catalog/stills-session'
import {
  stillsCapabilities,
  stillsActionSpec,
  sessionDescribe,
  catalogQuery,
  catalogGuide,
} from './meta-methods'
import {
  blueprintDomain,
  type BlueprintDomainState,
  type BlueprintPhase,
  type BlueprintExecutionMode,
  type BlueprintPlanItem,
  type BlueprintCheckpoint,
  type ExecutionBlueprint,
  requireBlueprint,
  readSessionBlueprint,
  writeSessionBlueprint,
} from '../business/project-planning/stills'
import {
  editDomain,
  getEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
  type EditDomainState,
  type EditToolHost,
} from '../business/page-design/stills'

const metaStills = [
  stillsCapabilities,
  stillsActionSpec,
  sessionDescribe,
  catalogQuery,
  catalogGuide,
] as const

export { registerStill, registerAll, getStill, getAllStills, clearRegistry, executeStill }
export type {
  DomainState,
  StillGuard,
  StillResult,
  StillDefinition,
  PatchEntry,
  IStillSession,
  DomainProvider,
  PostValidationWarning,
  BlueprintPlanItem,
  BlueprintCheckpoint,
  ExecutionBlueprint,
  BlueprintDomainState,
  BlueprintPhase,
  BlueprintExecutionMode,
  EditDomainState,
  EditToolHost,
}

export { noGuard, requireBlueprint, readSessionBlueprint, writeSessionBlueprint }

export function createSession(options?: CreateSessionOptions): IStillSession {
  return createStillsSession(options)
}

export { registerDomain, getDomain, clearDomains }
export { stillsCapabilities, stillsActionSpec, sessionDescribe, catalogQuery, catalogGuide }

export function registerAllStills(): void {
  registerDomain(blueprintDomain)
  registerAll(metaStills as unknown as StillDefinition[])
}

export function registerEditStills(): void {
  registerDomain(editDomain)
  registerAll(metaStills as unknown as StillDefinition[])
}

export {
  getEditState,
  getActiveNodeTree,
  bindLiveModelAdapter,
}