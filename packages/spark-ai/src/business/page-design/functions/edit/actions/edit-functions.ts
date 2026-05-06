import {
  createMethodBackedDefinitions,
} from '../../../../../core/protocol/method-backed-definition-builder'
import type {
  FunctionCarrierContract,
  FunctionResult,
  RegisteredFunctionDefinition,
} from '../../../../../core/protocol/function-contracts'
import {
  editInit,
  createEditLifecycleFunctions,
  EDIT_LIFECYCLE_FUNCTION_SUMMARIES,
  getActiveDataSetTool,
  getActiveNodeTree,
  notifyDataSetChanged,
  notifyNodeTreeChanged,
  type EditState,
} from '../../lifecycle'
import { createEditFileFunctions, EDIT_FILE_FUNCTION_SUMMARIES } from '../../text-model'
import { DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE } from '../../dataset'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE, validateSparkNodeTreeToolParams } from '../../node-tree'

const PAGE_DESIGN_NODE_TREE_MODULE_PROMPT = 'pageDesign@nodeTree 只操作当前 live SparkNodeTree/rule.json 结构；构造或替换组件前必须先用 core@knowledge@queryPayloads/guidePayload 查询合法 SparkNode schema，并使用真实 componentId/parentId。'
const PAGE_DESIGN_DATASET_MODULE_PROMPT = 'pageDesign@dataset 只操作当前 DataSetCrudTool/pagedata.json 数据空间；DataSet 是内存数据与视图配置，不是数据库，禁止套用 FK、索引、约束等 RDBMS 假设。'
export const PAGE_DESIGN_NODE_TREE_CARRIER_KEY = 'pageDesign@nodeTree' as const
export const PAGE_DESIGN_DATASET_CARRIER_KEY = 'pageDesign@dataset' as const

const HIDDEN_EDIT_DATASET_METHODS = new Set([
  'toJson',
  'listAggregates',
  'getAggregate',
  'addAggregate',
  'updateAggregate',
  'removeAggregate',
])

function buildNodeTreeExecuteFix(row: (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number]): string {
  return `正确参数格式: ${JSON.stringify(row.paramsSchema)}${
    Object.keys(row.example).length > 0 ? `；示例: ${JSON.stringify(row.example)}` : ''
  }${row.usageRules.length > 0 ? `；关键规则: ${row.usageRules.join('；')}` : ''}`
}

export function createEditNodeTreeCarrier(state: EditState): FunctionCarrierContract<EditState> {
  return {
    carrierKey: PAGE_DESIGN_NODE_TREE_CARRIER_KEY,
    prompt: PAGE_DESIGN_NODE_TREE_MODULE_PROMPT,
    description: 'pageDesign 节点树载体，负责当前 live rule.json / SparkNodeTree 结构编辑。',
    instance: state,
  }
}

export function createEditDataSetCarrier(state: EditState): FunctionCarrierContract<EditState> {
  return {
    carrierKey: PAGE_DESIGN_DATASET_CARRIER_KEY,
    prompt: PAGE_DESIGN_DATASET_MODULE_PROMPT,
    description: 'pageDesign 数据空间载体，负责当前 DataSetCrudTool / pagedata.json 编辑。',
    instance: state,
  }
}

export function createEditNodeTreeFunctions(): RegisteredFunctionDefinition[] {
  return createMethodBackedDefinitions<EditState, (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number], ReturnType<typeof getActiveNodeTree> extends infer T ? Exclude<T, null> : never>({
    rows: SPARK_NODE_TREE_TOOL_PARAMETER_TABLE,
    resolveTarget: (state: EditState) => getActiveNodeTree(state),
    methodName: (row) => row.coreMethod,
    validate: (row, params: unknown) => validateSparkNodeTreeToolParams(row.action, params),
    missingTarget: (): FunctionResult => ({
      ok: false,
      code: 'NO_NODE_TREE',
      msg: 'nodeTree 未初始化',
      fix: `请先执行 ${editInit.action} 初始化编辑会话`,
    }),
    executeError: (row, errorMessage): FunctionResult => ({
      ok: false,
      code: 'EXECUTE_ERROR',
      msg: errorMessage,
      fix: buildNodeTreeExecuteFix(row),
    }),
    afterRequest: (state: EditState, tree) => { notifyNodeTreeChanged(state, tree) },
  })
}

export function createEditDataSetFunctions(): RegisteredFunctionDefinition[] {
  return createMethodBackedDefinitions<EditState, (typeof DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE)[number], ReturnType<typeof getActiveDataSetTool> extends infer T ? Exclude<T, null> : never>({
    rows: DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE
      .filter((row) => !HIDDEN_EDIT_DATASET_METHODS.has(row.crudToolMethod)),
    resolveTarget: (state: EditState) => getActiveDataSetTool(state),
    methodName: (row) => row.crudToolMethod,
    validate: () => null,
    missingTarget: (): FunctionResult => ({
      ok: false,
      code: 'NO_DATASET_EDIT',
      msg: 'datasetEdit 未初始化',
      fix: `请先执行 ${editInit.action}`,
    }),
    missingMethod: (row): FunctionResult => ({
      ok: false,
      code: 'METHOD_NOT_FOUND',
      msg: `pageDesign dataset 动作 ${row.action} 指向的 DataSetCrudTool.${row.crudToolMethod} 不存在`,
      fix: '请改用当前已注册且有实现的 pageDesign dataset 动作；视图聚合配置请使用 pageDesign@dataset@updateView。',
    }),
    executeError: (row, errorMessage): FunctionResult => ({
      ok: false,
      code: 'EXECUTE_ERROR',
      msg: errorMessage,
      fix: `参数格式：${JSON.stringify(row.paramsSchema)}`,
    }),
    afterRequest: (state: EditState, tool) => { notifyDataSetChanged(state, tool) },
  })
}

export function createPageDesignEditFunctions() {
  return [
    ...createEditLifecycleFunctions(),
    ...createEditFileFunctions(),
    ...createEditNodeTreeFunctions(),
    ...createEditDataSetFunctions(),
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

