/**
 * Edit State — 编辑会话的状态定义与访问器
 *
 * 独立模块，不依赖任何 stills 子模块，避免循环依赖。
 * 仅负责状态类型、session 访问器和初始 state 工厂。
 */

import type { IStillSession, DomainState } from './types'
import { getDomainState } from './types'
import type { SparkNodeTree } from '@spark-view/spark-component'
import type { DataSetCrudTool } from '@spark-view/spark-data'
import type { EditModelSnapshot } from './edit-model'

// ═══════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════

export type EditPhase = 'idle' | 'editing' | 'saved'

export interface EditDomainState extends DomainState<null, EditPhase> {
  nodeTree: SparkNodeTree | null
  datasetEdit: DataSetCrudTool | null
  script: string
  style: string
  baselineSnapshot: EditModelSnapshot | null
}

// ═══════════════════════════════════════════════════════════
// 状态访问
// ═══════════════════════════════════════════════════════════

export function getEditState(session: IStillSession): EditDomainState {
  return getDomainState<EditDomainState>(session, 'edit')
}

export function createEditState(): EditDomainState {
  return {
    data: null,
    phase: 'idle',
    nodeTree: null,
    datasetEdit: null,
    script: '',
    style: '',
    baselineSnapshot: null,
  }
}
