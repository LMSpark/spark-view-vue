/**
 * Edit — SparkNodeTree Stills
 *
 * 由 SPARK_NODE_TREE_TOOL_PARAMETER_TABLE catalog 驱动。
 * validate 不通过 → 返回正确 paramsSchema 让 LLM 修正重提
 * execute 出错   → 返回错误信息 + paramsSchema 让 LLM 修正重提
 */

import type { IStillSession, StillDefinition, StillResult } from './types'
import { editGuard, getEditState } from './edit-domain'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE } from './spark-node-tree-tool-catalog'
import { validateLlmDeserializedParams, formatLlmParamValidationIssues } from './llm-params-validator'

type DispatchFn = (...args: unknown[]) => unknown

const treeGuard = editGuard({ requireNodeTree: true, requireDatasetExported: true })

export function createNodeTreeStills(): StillDefinition[] {
  return SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row) => ({
    action: row.action,
    type: row.type,
    description: row.description,
    guard: treeGuard,
    paramsSchema: row.paramsSchema,
    resultSchema: row.resultSchema,
    example: row.example,
    usageRules: row.usageRules,
    failureModes: row.failureModes,
    validate(params: unknown): string | null {
      if (Object.keys(row.paramsSchema).length === 0) return null
      const result = validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
      return result.ok ? null : formatLlmParamValidationIssues(result.issues)
    },
    execute(session: IStillSession, params: unknown): StillResult {
      const tree = getEditState(session).nodeTree
      if (!tree) return { ok: false, code: 'NO_NODE_TREE', msg: 'nodeTree 未初始化', fix: '请先执行 edit.init 初始化编辑会话' }
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
    },
  } as StillDefinition))
}
