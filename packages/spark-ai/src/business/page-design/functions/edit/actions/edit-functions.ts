import type { FunctionResult, RegisteredFunctionDefinition } from '../../../../../core/function/contracts'
import {
  editInit,
  createEditLifecycleFunctions,
  EDIT_LIFECYCLE_FUNCTION_SUMMARIES,
  getActiveDataSetTool,
  getActiveNodeTree,
  notifyDataSetChanged,
  notifyNodeTreeChanged,
  type EditState,
} from '../../lifecycle/edit-lifecycle-functions'
import { createEditFileFunctions, EDIT_FILE_FUNCTION_SUMMARIES } from '../../text-model/text-model-functions'
import { DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE } from '../../dataset'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE, validateSparkNodeTreeToolParams } from '../../node-tree'
import { TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE } from '../../text-model/tool-catalog'

const PAGE_DESIGN_NODE_TREE_MODULE_PROMPT = 'pageDesign@nodeTree 只操作当前 live SparkNodeTree/rule.json 结构；构造或替换组件前必须先用 core@knowledge@queryPayloads/guidePayload 查询合法 SparkNode schema，并使用真实 componentId/parentId。'
const PAGE_DESIGN_DATASET_MODULE_PROMPT = 'pageDesign@dataset 只操作当前 DataSetCrudTool/pagedata.json 数据空间；DataSet 是内存数据与视图配置，不是数据库，禁止套用 FK、索引、约束等 RDBMS 假设。'

const HIDDEN_EDIT_DATASET_METHODS = new Set([
  'toJson',
  'listAggregates',
  'getAggregate',
  'addAggregate',
  'updateAggregate',
  'removeAggregate',
])

function executeNodeTreeFunctionRow(
  state: EditState,
  row: (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number],
  params: unknown,
): FunctionResult {
  const tree = getActiveNodeTree(state)

  if (!tree) {
    return {
      ok: false,
      code: 'NO_NODE_TREE',
      msg: 'nodeTree 未初始化',
      fix: `请先执行 ${editInit.action} 初始化编辑会话`,
    }
  }

  try {
    const fn: unknown = Reflect.get(tree, row.coreMethod)
    if (typeof fn !== 'function') throw new Error(`Method ${row.coreMethod} not found on SparkNodeTree`)

    const dispatch = fn as (this: typeof tree, payload?: unknown) => unknown
    const data = dispatch.call(tree, params)

    if (row.type === 'request') {
      notifyNodeTreeChanged(state, tree)
    }

    return { ok: true, data, summary: `${row.action} 完成` }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)

    return {
      ok: false,
      code: 'EXECUTE_ERROR',
      msg: errMsg,
      fix: `正确参数格式: ${JSON.stringify(row.paramsSchema)}${
        Object.keys(row.example).length > 0 ? `；示例: ${JSON.stringify(row.example)}` : ''
      }${row.usageRules.length > 0 ? `；关键规则: ${row.usageRules.join('；')}` : ''}`,
    }
  }
}

function executeDatasetFunctionRow(
  state: EditState,
  row: (typeof DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE)[number],
  params: unknown,
): FunctionResult {
  const tool = getActiveDataSetTool(state)
  if (!tool) {
    return {
      ok: false,
      code: 'NO_DATASET_EDIT',
      msg: 'datasetEdit 未初始化',
      fix: `请先执行 ${editInit.action}`,
    }
  }

  try {
    const member: unknown = Reflect.get(tool, row.crudToolMethod)
    if (typeof member !== 'function') {
      return {
        ok: false,
        code: 'METHOD_NOT_FOUND',
        msg: `pageDesign dataset 动作 ${row.action} 指向的 DataSetCrudTool.${row.crudToolMethod} 不存在`,
        fix: '请改用当前已注册且有实现的 pageDesign dataset 动作；视图聚合配置请使用 pageDesign@dataset@updateView。',
      }
    }

    const dispatch = member as (this: typeof tool, payload?: unknown) => unknown
    const data = dispatch.call(tool, params)

    if (row.type === 'request') {
      notifyDataSetChanged(state, tool)
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

export function createEditNodeTreeFunctions(state: EditState): RegisteredFunctionDefinition[] {
  return SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row) => ({
    action: row.action,
    type: row.type,
    description: row.description,
    modulePrompt: PAGE_DESIGN_NODE_TREE_MODULE_PROMPT,
    paramsSchema: row.paramsSchema,
    resultSchema: row.resultSchema,
    example: row.example,
    usageRules: row.usageRules,
    failureModes: row.failureModes,
    validate: (params: unknown) => validateSparkNodeTreeToolParams(row.action, params),
    execute: (_context, params: unknown) => executeNodeTreeFunctionRow(state, row, params),
  }))
}

export function createEditDataSetFunctions(state: EditState): RegisteredFunctionDefinition[] {
  return DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE
    .filter((row) => !HIDDEN_EDIT_DATASET_METHODS.has(row.crudToolMethod))
    .map((row) => ({
      action: row.action,
      type: row.type,
      description: row.description,
      modulePrompt: PAGE_DESIGN_DATASET_MODULE_PROMPT,
      paramsSchema: row.paramsSchema,
      resultSchema: row.resultSchema,
      example: row.example,
      usageRules: row.usageRules,
      failureModes: row.failureModes,
      validate: () => null,
      execute: (_context, params: unknown) => executeDatasetFunctionRow(state, row, params),
    }))
}

export function createPageDesignEditFunctions(state: EditState): RegisteredFunctionDefinition[] {
  return [
    ...createEditLifecycleFunctions(state),
    ...createEditFileFunctions(state),
    ...createEditNodeTreeFunctions(state),
    ...createEditDataSetFunctions(state),
  ]
}

export const EDIT_FUNCTION_SUMMARIES = [
  ...EDIT_LIFECYCLE_FUNCTION_SUMMARIES,
  ...EDIT_FILE_FUNCTION_SUMMARIES,
  ...SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map(row => ({ action: row.action, type: row.type })),
  ...DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE
    .filter((row) => !HIDDEN_EDIT_DATASET_METHODS.has(row.crudToolMethod))
    .map(row => ({ action: row.action, type: row.type })),
] as const

export function isEditNodeTreeWriteAction(action: string): boolean {
  return SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.some((row) => row.type === 'request' && row.action === action)
}

export function isEditDataSetWriteAction(action: string): boolean {
  return DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE.some(
    (row) => row.type === 'request'
      && row.action === action
      && !HIDDEN_EDIT_DATASET_METHODS.has(row.crudToolMethod),
  )
}

export function isEditTextModelWriteAction(action: string): boolean {
  return TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE.some((row) => row.type === 'request' && row.action === action)
}

export function isEditWriteAction(action: string): boolean {
  return (
    isEditNodeTreeWriteAction(action)
    || isEditDataSetWriteAction(action)
    || isEditTextModelWriteAction(action)
  )
}

