/**
 * Edit — DataSetCrudTool Stills
 *
 * 由 DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE catalog 驱动。
 * 本文件自包含 catalog → StillDefinition 的投影逻辑。
 */

import type { IStillSession, StillDefinition, StillResult } from './types'
import { getEditState } from './edit-state'
import { datasetGuard } from './edit-guard'
import { EDIT_BOOTSTRAP_ACTION } from './action-names'
import {
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE,
  validateDataSetCrudToolStillParams,
} from './dataset-crud-tool-stills-catalog'

// ─────────────────────────────────────────────────────────────────────────────
// 类型与静态索引
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DataSetCrudTool 方法的统一调用签名。
 *
 * 目录表中的方法有两类：
 * 1. 无参方法：直接调用，不传任何参数；
 * 2. 有参方法：统一接收一个对象参数。
 *
 * 这里使用宽签名承接两种调用方式，避免把每个方法单独做类型分发。
 */
type DispatchFn = (...args: unknown[]) => unknown

/**
 * 从 catalog 推导“无参动作”集合。
 *
 * 目的：
 * 1. 避免在运行时硬编码 action 名称；
 * 2. 让 catalog 成为参数分发规则的唯一来源；
 * 3. 后续若目录表新增无参动作，这里会自动同步。
 */
const noArgActions = new Set(
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE
    .filter((row) => Object.keys(row.paramsSchema).length === 0)
    .map((row) => row.action)
)

// ─────────────────────────────────────────────────────────────────────────────
// 参数分发与结果清洗
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将 still 参数转换为 DataSetCrudTool 方法的实际调用参数。
 *
 * 约束：
 * 1. 无参动作必须传空数组，不能额外塞入 {}；
 * 2. 有参动作统一传入单个对象；
 * 3. 传入 undefined/null 时兜底为空对象，保持调用层简单。
 */
function resolveDispatchArgs(action: string, params: unknown): unknown[] {
  if (noArgActions.has(action)) {
    return []
  }
  return [(params ?? {}) as Record<string, unknown>]
}

/**
 * 清理导出结果中的 layout 字段。
 *
 * 编辑模式下，部分 DataSetCrudTool 返回值会携带 layout 元数据；
 * 这些信息不属于 still 对外结果契约，保留会增加模型噪音，
 * 因此在对象结果场景下统一剔除。
 */
function stripLayoutField(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data
  const { layout: _layout, ...rest } = data as Record<string, unknown>
  return rest
}

// ─────────────────────────────────────────────────────────────────────────────
// 参数校验
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 对单个 catalog 行执行 still 入参校验。
 *
 * 这里除了复用 catalog 提供的 schema 校验外，还补充编辑模式特有约束：
 * - 禁止调用 datasetTool.export
 * - 必须改走统一的 dataset.export
 *
 * 原因是编辑态的数据优先链路要求导出动作保持统一出口，
 * 便于编排器识别“已导出”状态并继续后续流程。
 */
function validateDatasetStillRow(
  row: (typeof DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE)[number],
  params: unknown,
): string | null {
  if (row.action === 'datasetTool.export') {
    return '数据优先流程已启用，禁止使用 datasetTool.export，请改用 dataset.export'
  }
  return validateDataSetCrudToolStillParams(row.action, params ?? {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 执行器
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 执行单条 dataset still。
 *
 * 执行流程：
 * 1. 从 session 读取编辑态上下文；
 * 2. 校验 datasetEdit 是否已由 edit.bootstrap 初始化；
 * 3. 根据 catalog 指定的方法名进行动态派发；
 * 4. 清洗返回结果中的 layout 噪音字段；
 * 5. 若当前 still 属于 request 类型，重置 datasetExported，表示导出结果已失效；
 * 6. 统一把运行时异常折叠为 StillResult，避免异常逃逸到主循环。
 */
function executeDatasetStillRow(
  session: IStillSession,
  row: (typeof DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE)[number],
  params: unknown,
): StillResult {
  const state = getEditState(session)
  const tool = state.datasetEdit
  if (!tool) {
    return {
      ok: false,
      code: 'NO_DATASET_EDIT',
      msg: 'datasetEdit 未初始化',
      fix: `请先执行 ${EDIT_BOOTSTRAP_ACTION}`,
    }
  }

  try {
    const member = (tool as unknown as Record<string, unknown>)[row.crudToolMethod]
    const rawData =
      typeof member === 'function'
        ? (member as DispatchFn).call(tool, ...resolveDispatchArgs(row.action, params))
        : member
    const data = stripLayoutField(rawData)

    if (row.type === 'request') {
      state.datasetExported = false
    }

    return { ok: true, data, summary: `${row.action} 完成` }
  } catch (err) {
    return {
      ok: false,
      code: 'EXEC_ERROR',
      msg: err instanceof Error ? err.message : String(err),
      fix: `参数格式：${JSON.stringify(row.paramsSchema)}`,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// catalog → StillDefinition 投影
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将 DataSetCrudTool 参数目录表批量投影为 still 定义。
 *
 * 设计目标：
 * 1. still 元数据完全复用 catalog，避免双份维护；
 * 2. execute / validate 只做编辑态补充，不重复描述业务结构；
 * 3. 新增 datasetTool.* 动作时，只需更新 catalog 即可自动注册。
 */
export const EDIT_DATASET_STILLS: StillDefinition[] = DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE.map((row) => ({
  action: row.action,
  type: row.type,
  description: row.description,
  guard: datasetGuard,
  paramsSchema: row.paramsSchema,
  resultSchema: row.resultSchema,
  example: row.example,
  usageRules: row.usageRules,
  failureModes: row.failureModes,
  validate: (params: unknown) => validateDatasetStillRow(row, params),
  execute: (session: IStillSession, params: unknown) => executeDatasetStillRow(session, row, params),
} as StillDefinition))

