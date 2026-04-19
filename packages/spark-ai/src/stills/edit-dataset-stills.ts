/**
 * Edit — DataSetCrudTool Stills
 *
 * 由 DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE catalog 驱动。
 * - validate：validateDataSetCrudToolStillParams 统一入口
 * - execute：调用 DataSetCrudTool 对应方法，任何 request 操作标记数据脏
 * - 禁止 datasetTool.export（强制用 dataset.export）
 */

import type { IStillSession, StillDefinition, StillResult } from './types'
import { editGuard, getEditState } from './edit-domain'
import {
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE,
  validateDataSetCrudToolStillParams,
} from './dataset-crud-tool-stills-catalog'

type DispatchFn = (...args: unknown[]) => unknown

// 从 catalog 构建无参 action 集合，避免硬编码字符串检查
const noArgActions = new Set(
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE
    .filter((row) => Object.keys(row.paramsSchema).length === 0)
    .map((row) => row.action)
)

function resolveDispatchArgs(action: string, params: unknown): unknown[] {
  if (noArgActions.has(action)) {
    return []
  }
  return [(params ?? {}) as Record<string, unknown>]
}

function stripLayoutField(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return data
  const { layout: _layout, ...rest } = data as Record<string, unknown>
  return rest
}

export function createDatasetStills(): StillDefinition[] {
  return DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE.map((row) => ({
    action: row.action,
    type: row.type,
    description: row.description,
    guard: editGuard({ requireDatasetEdit: true }),
    paramsSchema: row.paramsSchema,
    resultSchema: row.resultSchema,
    example: row.example,
    usageRules: row.usageRules,
    failureModes: row.failureModes,
    validate(params: unknown): string | null {
      if (row.action === 'datasetTool.export') {
        return '数据优先流程已启用，禁止使用 datasetTool.export，请改用 dataset.export'
      }
      return validateDataSetCrudToolStillParams(row.action, params ?? {})
    },
    execute(session: IStillSession, params: unknown): StillResult {
      const state = getEditState(session)
      const tool = state.datasetEdit
      if (!tool) {
        return { ok: false, code: 'NO_DATASET_EDIT', msg: 'datasetEdit 未初始化', fix: '请先执行 edit.init' }
      }
      try {
        const member = (tool as unknown as Record<string, unknown>)[row.crudToolMethod]
        const rawData = typeof member === 'function'
          ? (member as DispatchFn).call(tool, ...resolveDispatchArgs(row.action, params))
          : member
        const data = stripLayoutField(rawData)
        if (row.type === 'request') {
          state.datasetExported = false
          // 修改操作完成，下次查询数据集模型时会自动基于最新的 tool 状态计算
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
    },
  } as StillDefinition))
}

