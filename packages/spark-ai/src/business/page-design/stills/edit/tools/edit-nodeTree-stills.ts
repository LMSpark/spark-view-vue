/**
 * Edit — SparkNodeTree Stills
 *
 * 页面节点树（SparkNodeTree）相关的动作（Stills）集合。
 * 由预定义的 SPARK_NODE_TREE_TOOL_PARAMETER_TABLE 静态元数据（Catalog）驱动，
 * 负责将抽象的配置信息映射并投影为具体可执行的 StillDefinition。
 *
 * 核心设计：
 * - 规则与执行的解耦（Catalog 维护命令规则，本文件维护执行框架）
 * - 统一生命周期、守卫和拦截处理
 */

// ── 1. 依赖导入 (Imports) ─────────────────────────────────────────────────────────

import type { IStillSession, StillDefinition, StillResult } from '../../../../../core/stills/types'
import { getActiveNodeTree, getEditState, notifyNodeTreeChanged } from '../edit-lifecycle-stills'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE } from '../../spark-node-tree-tool-catalog'
import { validateLlmDeserializedParams, formatLlmParamValidationIssues } from '../../../../../core/stills/llm-params-validator'
import { validateNodeTreeDataKeysByDatasetEdit } from './edit-dataset-stills'

// ── 2. 类型定义 (Type Definitions) ────────────────────────────────────────────────

/**
 * 通用的分发函数签名，用于绕过 TypeScript 强类型约束动态调用模块方法。
 */
type DispatchFn = (...args: unknown[]) => unknown

function buildNodeTreeActionSummary(action: string, data: unknown): string {
  if (action === 'sparkNodeTree.listChildren') {
    const count = Array.isArray(data) ? data.length : 0
    return `${action} 完成（children=${count}）`
  }

  if (action === 'sparkNodeTree.getAllData') {
    if (typeof data === 'object' && data !== null) {
      const root = data as Record<string, unknown>
      const childCount = Array.isArray(root['children']) ? root['children'].length : 0
      const rootType = typeof root['type'] === 'string' ? root['type'] : 'unknown'
      return `${action} 完成（root=${rootType}, children=${childCount}）`
    }
    return `${action} 完成`
  }

  if (action === 'sparkNodeTree.countNodes') {
    const count = typeof data === 'number' ? data : Number.NaN
    return Number.isFinite(count)
      ? `${action} 完成（count=${count}）`
      : `${action} 完成`
  }

  return `${action} 完成`
}


// ── 3. 参数验证逻辑 (Parameter Validation) ────────────────────────────────────────

/**
 * 校验节点树操作命令的输入参数
 *
 * 根据 Catalog 中定义的 Params Schema，对传入的参数对象进行验证。
 * 如果参数合法，返回 null 表示通过；否则返回格式化后的错误提醒字符串。
 *
 * @param row    当前动作在 Catalog 中的元数据定义行
 * @param params 从上游（通常是 LLM）传入的反序列化参数
 * @returns 验证错误信息，验证通过则返回 null
 */
function validateNodeTreeStillRow(
  row: (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number],
  params: unknown,
): string | null {
  // 如果此动作无需任何参数（对应的 schema 为空），则直接通过校验
  if (Object.keys(row.paramsSchema).length === 0) return null

  // 调用通用的校验器执行深层校验
  const result = validateLlmDeserializedParams(params ?? {}, row.paramsSchema)
  
  // 返回校验结果或统一格式化后的错误详情
  return result.ok ? null : formatLlmParamValidationIssues(result.issues)
}

// ── 4. 核心执行逻辑 (Execution Logic) ─────────────────────────────────────────────

/**
 * 调度并执行具体的节点树操作
 *
 * 从当前的 Session 状态中拉取活跃的 NodeTree，并将 Catalog 描述的方法名映射为实际调用。
 * 此过程会接住底层抛出的所有的异常，并转为规范化的 StillResult 返回，避免阻塞整个执行管线。
 *
 * @param session 当前的 Still 上下文会话状态
 * @param row     当前动作在 Catalog 中的元数据定义行
 * @param params  经前端校验通过的执行参数
 * @returns 统一封装的 StillResult (成功则包含数据，失败提供 code / msg / fix)
 */
function executeNodeTreeStillRow(
  session: IStillSession,
  row: (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number],
  params: unknown,
): StillResult {
  const state = getEditState(session)
  // 从共享状态的 store 中获取已经初始化的页面节点树（SparkNodeTree）
  const tree = getActiveNodeTree(state)

  // 防卫检查：如因生命周期顺序错乱导致树未建立，给出修补建议
  if (!tree) {
    return {
      ok: false,
      code: 'NO_NODE_TREE',
      msg: 'nodeTree 未初始化',
      fix: '请先执行 edit.bootstrap 初始化编辑会话',
    }
  }
  
  // 动态方法分发与异常捕捉
  try {
    // 从底层树引擎实例上查找对应的方法（如 insertNode, removeNode 等）
    const fn = (tree as unknown as Record<string, DispatchFn>)[row.coreMethod]
    if (!fn) throw new Error(`Method ${row.coreMethod} not found on SparkNodeTree`)
    
    // 执行底层修改逻辑，携带从外界传入的参数
    const data = fn.call(tree, params ?? {})

    if (row.type === 'request') {
      const dataKeyValidationError = validateNodeTreeDataKeysByDatasetEdit(session, tree)
      if (dataKeyValidationError !== null) {
        if (tree.canUndo) {
          tree.undo()
        }
        return {
          ok: false,
          code: 'DATAKEY_SEGMENT_INVALID',
          msg: dataKeyValidationError,
          fix: '请修复本次修改引入的 dataKey，确保每一段都通过 datasetEdit 校验（table/view/fieldPath）。',
        }
      }

      notifyNodeTreeChanged(state, tree)
    }
    
    // 封装并返回成功摘要给调用方
    return { ok: true, data, summary: buildNodeTreeActionSummary(row.action, data) }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)

    // listChildren 的父节点未命中是最常见误用之一。
    // 这里返回结构化错误，显式阻止模型把“节点未命中”误判为“页面为空”。
    if (row.action === 'sparkNodeTree.listChildren' && /not found/i.test(errMsg)) {
      return {
        ok: false,
        code: 'PARENT_NOT_FOUND',
        msg: errMsg,
        fix: 'parentComponentId 必须是真实节点 id（来自 listChildren/getNode/findByType 的返回值），不能传组件类型名。此错误不代表 rule.json 为空；请先调用 sparkNodeTree.listChildren({"parentComponentId":null}) 或 sparkNodeTree.findByType 获取真实 id 后重试。',
      }
    }

    const exampleText = Object.keys(row.example).length > 0
      ? `；示例: ${JSON.stringify(row.example)}`
      : ''
    const rulesText = row.usageRules.length > 0
      ? `；关键规则: ${row.usageRules.join('；')}`
      : ''

    // 捕获节点树引擎可能抛出的业务或运行时错误
    return {
      ok: false,
      code: 'EXECUTE_ERROR',
      msg: errMsg,
      fix: `正确参数格式: ${JSON.stringify(row.paramsSchema)}${exampleText}${rulesText}`,
    }
  }
}

// ── 5. 注册与导出 (Registry & Export) ─────────────────────────────────────────────

/**
 * 节点树编辑动作集合配置 (Stills List)
 * 
 * 将底层扁平表定义的配置记录全量映射转换为统一的 StillDefinition 结构。
 * 生成的数组可以被外部的 Dispatcher 注册并接入整体 Action 管线。
 */
export const EDIT_NODE_TREE_STILLS: StillDefinition[] = SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row) => ({
  action: row.action,
  type: row.type,
  description: row.description,
  paramsSchema: row.paramsSchema,
  resultSchema: row.resultSchema,
  example: row.example,
  usageRules: row.usageRules,
  failureModes: row.failureModes,
  validate: (params: unknown) => validateNodeTreeStillRow(row, params),
  execute: (session: IStillSession, params: unknown) => executeNodeTreeStillRow(session, row, params),
} as StillDefinition))
