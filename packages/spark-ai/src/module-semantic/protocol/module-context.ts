/**
 * Runtime contexts and delegate contracts for module semantic kinds.
 */

import type { LlmJsonValue } from '../../schema'
import type { ModuleOperationResult } from './module-operation'
import type { ModulePathSegment } from './module-path'

export type ModuleHostContext = Readonly<{
  moduleId: string
  moduleInstanceId: string
  instanceId: string
}>

export type ModulePathContext = Readonly<{
  segments: readonly ModulePathSegment[]
  segment: ModulePathSegment
  host?: ModuleHostContext | undefined
}>

export type ModuleInstanceRef = Readonly<{
  id: string
  label: string
  summary?: string | undefined
}>

export type ModuleInstanceQuery = Readonly<Record<string, LlmJsonValue>>

export type ModuleKindOperation<TData> = ModuleOperationResult<TData> | Promise<ModuleOperationResult<TData>>

export type ModuleKindRunner = (
  ctx: ModulePathContext,
  actionName: string,
  args: Readonly<Record<string, LlmJsonValue>>,
) => ModuleKindOperation<LlmJsonValue>

export type ModuleChildrenLister = (
  ctx: ModulePathContext,
  childKind?: string,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>

export type ModuleInstanceFinder = (
  ctx: ModulePathContext,
  childKind: string,
  query: ModuleInstanceQuery,
) => ModuleKindOperation<readonly ModuleInstanceRef[]>
