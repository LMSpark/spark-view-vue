/**
 * Edit Domain — 编辑会话流程层
 *
 * 单一责任：管理编辑会话的生命周期（phase: idle → editing → saved）。
 *
 * 不直接定义具体操作 — 具体操作下沉到各 FC 子模块：
 * - edit-lifecycle-stills.ts:   生命周期（bootstrap）
 * - edit-file-stills.ts:        文件读写（catalog-driven）
 * - edit-diff-stills.ts:        差异观测
 * - edit-export-stills.ts:      导出检查点
 * - edit-dataset-model-query-stills.ts: DatasetModel 查询
 * - edit-nodeTree-stills.ts:    页面规则操作（catalog-driven）
 * - edit-dataset-stills.ts:     数据集 CRUD 操作（catalog-driven）
 *
 * 状态定义在 edit-state.ts，守卫定义在 edit-guard.ts，所有子模块共享，无循环依赖。
 */

import type {
  DomainProvider,
  StillDefinition,
} from './types'
import { createEditState, type EditDomainState } from './edit-state'
import { EDIT_LIFECYCLE_STILLS } from './edit-lifecycle-stills'
import { EDIT_FILE_STILLS } from './edit-file-stills'
import { EDIT_DIFF_STILLS } from './edit-diff-stills'
import { EDIT_EXPORT_STILLS } from './edit-export-stills'
import { EDIT_NODE_TREE_STILLS } from './edit-nodeTree-stills'
import { EDIT_DATASET_STILLS } from './edit-dataset-stills'

// ═══════════════════════════════════════════════════════════
// FC 工具清单
//
// domain 直接聚合所有 FC 常量组，不经过 manifest 中间层。
// ═══════════════════════════════════════════════════════════

export const EDIT_STILLS: StillDefinition[] = [
  ...EDIT_LIFECYCLE_STILLS,
  ...EDIT_FILE_STILLS,
  ...EDIT_DIFF_STILLS,
  ...EDIT_EXPORT_STILLS,
  ...EDIT_NODE_TREE_STILLS,
  ...EDIT_DATASET_STILLS,
]

// ═══════════════════════════════════════════════════════════
// Domain Provider
// ═══════════════════════════════════════════════════════════

export const editDomain: DomainProvider<EditDomainState> = {
  name: 'edit',
  roleHint: '编辑模式：对已有页面的 rule.json / pagedata.json / script.js / style.css 进行增量修改',
  stills: EDIT_STILLS,
  createState: createEditState,
}

