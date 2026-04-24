/**
 * Edit — Lifecycle Stills
 *
 * 编辑会话生命周期入口（edit.bootstrap）。
 *
 * 说明：
 * 1) 当前架构下 UI 与 AI 共用同一份 live model；
 * 2) 因此 bootstrap 不再承担“宿主快照 vs live model”二次比对；
 * 3) 当前页面事实由前置文件加载和后续函数调用工具直接向 LLM 汇报。
 * 4) 术语约定：tool = 一个模型实例 + N 个函数入口。
 */

import type {
  StillResult,
  StillDefinition,
} from '../../../../core/stills/types'
import type { EditDomainState } from './edit-state'
import { getActiveDataSetTool, getActiveNodeTree, getEditState } from './edit-state'
import { EDIT_BOOTSTRAP_ACTION } from '../../../../core/stills/action-names'

export type EditInitParams = unknown

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区一：输入校验
// 目标：兼容旧调用方仍传对象，但 bootstrap 本身不再依赖 payload 内容。
// ─────────────────────────────────────────────────────────────────────────────

function validateEditBootstrapPayload(params: unknown): string | null {
  if (params === undefined || params === null) return null
  if (typeof params !== 'object') return 'edit.bootstrap 参数必须是对象或留空'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// 功能分区二：会话引导（bootstrap 主流程）
// 目标：
// 1) 校验 live adapter 能力齐全；
// 2) 确认当前页面 4 文件都可从 live adapter 读取；
// 3) 进入 editing phase。
// 注意：
// - 不修改 live tree/data/script/style 内容；
// - 不在 bootstrap 内重复构造“第二份事实快照”。
// ─────────────────────────────────────────────────────────────────────────────

function bootstrapEditSession(state: EditDomainState): void {
  // 1) nodeTree tool 必须存在（即模型实例 + 对应函数入口）。
  const nodeTreeTool = getActiveNodeTree(state)
  if (!nodeTreeTool) {
    throw new Error('edit.bootstrap 失败：缺少 nodeTree tool 实例（EditLiveModelAdapter.getNodeTree）')
  }

  // 2) dataset tool 必须存在（即模型实例 + 对应函数入口）。
  const dataSetTool = getActiveDataSetTool(state)
  if (!dataSetTool) {
    throw new Error('edit.bootstrap 失败：缺少 dataset tool 实例（EditLiveModelAdapter.getDataSetTool）')
  }

  // 3) script/style 读取器必须存在。
  const readScript = state.liveModelAdapter?.readScript
  if (!readScript) {
    throw new Error('edit.bootstrap 失败：缺少 script 读取器（EditLiveModelAdapter.readScript）')
  }

  const readStyle = state.liveModelAdapter?.readStyle
  if (!readStyle) {
    throw new Error('edit.bootstrap 失败：缺少 style 读取器（EditLiveModelAdapter.readStyle）')
  }

  // 4) 探测一次函数调用，确保适配器能力可用。
  void nodeTreeTool.toJSON()
  void dataSetTool.toJson()
  void readScript()
  void readStyle()

  // 5) 建立编辑会话状态：仅推进 phase。
  state.phase = 'editing'
}

// ─────────────────────────────────────────────────────────────────────────────
// Still 定义导出
// ─────────────────────────────────────────────────────────────────────────────

export const editInit: StillDefinition<EditInitParams, undefined> = {
  action: EDIT_BOOTSTRAP_ACTION,
  type: 'request',
  description: '引导编辑会话：仅校验 tool（模型实例 + N 个函数入口）可用，并进入 editing phase',
  paramsSchema: {},
  example: {},
  validate: validateEditBootstrapPayload,
  execute: (session, params): StillResult<undefined> => {
    void params
    bootstrapEditSession(getEditState(session))
    return { ok: true, data: undefined, summary: '编辑会话已完成 tool 引导（模型实例 + N 个函数入口），进入 editing 状态' }
  },
}

export const EDIT_LIFECYCLE_STILLS: StillDefinition[] = [editInit as StillDefinition]