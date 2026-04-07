/**
 * Edit — DataSetCrudTool Stills
 *
 * 由 DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE catalog 驱动。
 * validate: validateDataSetCrudToolStillParams 统一入口
 * execute 出错 → 返回错误信息 + paramsSchema 让 LLM 修正重提
 */

import type { IStillSession, StillDefinition, StillResult } from './types'
import { editGuard, getEditState } from './edit-domain'
import {
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE,
  validateDataSetCrudToolStillParams,
} from './dataset-crud-tool-stills-catalog'

type DispatchFn = (...args: unknown[]) => unknown

const dsGuard = editGuard({ requireDatasetEdit: true })

export function createDatasetStills(): StillDefinition[] {
  return DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE.map((row) => ({
    action: row.action,
    type: row.type,
    description: row.description,
    guard: dsGuard,
    paramsSchema: row.paramsSchema,
    resultSchema: row.resultSchema,
    example: row.example,
    usageRules: row.usageRules,
    failureModes: row.failureModes,
    validate(params: unknown): string | null {
      return validateDataSetCrudToolStillParams(row.action, params ?? {})
    },
    execute(session: IStillSession, params: unknown): StillResult {
      const tool = getEditState(session).datasetEdit
      if (!tool) return { ok: false, code: 'NO_DATASET_EDIT', msg: 'datasetEdit 未初始化', fix: '请先执行 edit.init 初始化编辑会话' }
      try {
        const fn = (tool as unknown as Record<string, DispatchFn>)[row.crudToolMethod]
        if (!fn) throw new Error(`Method ${row.crudToolMethod} not found on DataSetCrudTool`)
        const data = fn.call(tool, params ?? {})
        return { ok: true, data, summary: `${row.action} 完成` }
      } catch (err) {
        return {
          ok: false,
          code: 'EXECUTE_ERROR',
          msg: err instanceof Error ? err.message : String(err),
          fix: `正确参数格式: ${JSON.stringify(row.paramsSchema)}`,
        }
      }
    },
  } as StillDefinition))
}
