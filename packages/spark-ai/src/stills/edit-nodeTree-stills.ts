/**
 * Edit — SparkNodeTree Stills
 *
 * 由 SPARK_NODE_TREE_TOOL_PARAMETER_TABLE catalog 驱动。
 * 本文件自包含 catalog → StillDefinition 的投影逻辑。
 */

import type { IStillSession, StillDefinition, StillResult } from './types'
import { getEditState } from './edit-state'
import { treeGuard } from './edit-guard'
import { EDIT_BOOTSTRAP_ACTION } from './action-names'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE } from './spark-node-tree-tool-catalog'
import { validateLlmDeserializedParams, formatLlmParamValidationIssues } from './llm-params-validator'

type DispatchFn = (...args: unknown[]) => unknown

function validateNodeTreeStillRow(
  row: (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number],
  params: unknown,
): string | null {
  if (Object.keys(row.paramsSchema).length === 0) return null
  const result = validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
  return result.ok ? null : formatLlmParamValidationIssues(result.issues)
}

function executeNodeTreeStillRow(
  session: IStillSession,
  row: (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number],
  params: unknown,
): StillResult {
  const tree = getEditState(session).nodeTree
  if (!tree) {
    return { ok: false, code: 'NO_NODE_TREE', msg: 'nodeTree 未初始化', fix: `请先执行 ${EDIT_BOOTSTRAP_ACTION} 初始化编辑会话` }
  }
  try {
    const fn = (tree as unknown as Record<string, DispatchFn>)[row.coreMethod]
    if (!fn) throw new Error(`Method ${row.coreMethod} not found on SparkNodeTree`)
    const data = fn.call(tree, params ?? {})
    return { ok: true, data, summary: `${row.action} 完成` }
  } catch (err) {
    return {
      ok: false,
      code: 'EXECUTE_ERROR',
      msg: err instanceof Error ? err.message : String(err),
      fix: `正确参数格式: ${JSON.stringify(row.paramsSchema)}`,
    }
  }
}

export const EDIT_NODE_TREE_STILLS: StillDefinition[] = SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row) => ({
  action: row.action,
  type: row.type,
  description: row.description,
  guard: treeGuard,
  paramsSchema: row.paramsSchema,
  resultSchema: row.resultSchema,
  example: row.example,
  usageRules: row.usageRules,
  failureModes: row.failureModes,
  validate: (params: unknown) => validateNodeTreeStillRow(row, params),
  execute: (session: IStillSession, params: unknown) => executeNodeTreeStillRow(session, row, params),
} as StillDefinition))
