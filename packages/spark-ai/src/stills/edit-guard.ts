/**
 * Edit — Guard
 *
 * 编辑域准入规则与共享预设。
 * 各 FC 模块只声明自身行为，不重复拼装准入条件。
 */

import type { StillGuard } from './types'
import { EDIT_BOOTSTRAP_ACTION } from './action-names'
import { getEditState } from './edit-state'

// ─────────────────────────────────────────────────────────────────────────────
// 选项模型
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 编辑域守卫的可选检查项。
 *
 * 这些选项可以按需组合，不是互斥关系：
 * 1. 所有编辑 still 都先要求会话已经进入 editing 阶段；
 * 2. 再根据具体动作补充 nodeTree / datasetEdit / datasetExported 检查；
 * 3. 一旦命中第一个不满足条件，就立即返回失败原因。
 *
 * 这样可以把准入逻辑集中管理，避免多个 still 文件各自复制状态判断。
 */
export interface EditGuardOptions {
  requireNodeTree?: boolean
  requireDatasetEdit?: boolean
  requireDatasetExported?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// 守卫工厂
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建编辑域 still guard。
 *
 * 检查顺序是刻意固定的：
 * 1. phase 检查：确认 edit.bootstrap 已执行；
 * 2. nodeTree / datasetEdit 检查：确认对应子能力已经初始化；
 * 3. datasetExported 检查：确认数据阶段已完成，允许进入后续细粒度编辑。
 *
 * 这个顺序能保证错误信息尽量贴近真正缺失的前置条件，
 * 不会在会话尚未初始化时就暴露更下游的局部状态错误。
 *
 * 返回值约定：
 * - null：允许执行 still；
 * - { code, msg }：拒绝执行，并把首个失败原因返回给主循环。
 */
export function editGuard(checks: EditGuardOptions = {}): StillGuard {
  return (session): { code: string; msg: string } | null => {
    const state = getEditState(session)

    if (state.phase !== 'editing') {
      return {
        code: 'NOT_EDITING',
        msg: `编辑会话未初始化，请先执行 ${EDIT_BOOTSTRAP_ACTION}`,
      }
    }

    if (checks.requireNodeTree && state.nodeTree === null) {
      return { code: 'NO_NODE_TREE', msg: 'nodeTree 未初始化' }
    }

    if (checks.requireDatasetEdit && state.datasetEdit === null) {
      return { code: 'NO_DATASET_EDIT', msg: 'datasetEdit 未初始化' }
    }

    if (checks.requireDatasetExported && !state.datasetExported) {
      return {
        code: 'DATA_PHASE_REQUIRED',
        msg: '数据阶段未完成，请先执行 dataset.export 后再进行页面/脚本细粒度编辑',
      }
    }

    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 共享预设
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 最基础的编辑态守卫。
 *
 * 只要求 edit.bootstrap 已完成，
 * 适用于纯读取动作或不依赖具体子能力的通用 still。
 */
export const editingGuard = editGuard()

/**
 * 数据集能力守卫。
 *
 * 除 editing 阶段外，还要求 datasetEdit 已初始化。
 * 适用于 datasetTool.*、dataset.changedLines、dataset.export 等数据域动作。
 */
export const datasetGuard = editGuard({ requireDatasetEdit: true })

/**
 * 数据阶段完成守卫。
 *
 * 要求当前会话已经完成 dataset.export，
 * 主要用于 script/style 写入、页面细节调整等“后数据阶段”动作。
 */
export const datasetExportedGuard = editGuard({ requireDatasetExported: true })

/**
 * 页面树编辑守卫。
 *
 * 同时要求：
 * 1. nodeTree 已初始化；
 * 2. dataset.export 已完成。
 *
 * 适用于依赖页面树且必须处于后数据阶段的组件/布局编辑动作。
 */
export const treeGuard = editGuard({ requireNodeTree: true, requireDatasetExported: true })