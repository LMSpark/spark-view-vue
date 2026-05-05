import type { DomainProvider, IStillSession, StillDefinition, StillResult } from '../../../../../core/stills/types'
import {
  createEditState,
  editInit,
  EDIT_LIFECYCLE_STILLS,
  getActiveDataSetTool,
  getActiveNodeTree,
  getEditState,
  notifyDataSetChanged,
  notifyNodeTreeChanged,
  type EditDomainState,
} from '../../lifecycle/edit-lifecycle-stills'
import { EDIT_FILE_STILLS } from '../../text-model/text-model-stills'
import { DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE } from '../../dataset'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE, validateSparkNodeTreeToolParams } from '../../node-tree'

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

function executeNodeTreeStillRow(
  session: IStillSession,
  row: (typeof SPARK_NODE_TREE_TOOL_PARAMETER_TABLE)[number],
  params: unknown,
): StillResult {
  const state = getEditState(session)
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

function executeDatasetStillRow(
  session: IStillSession,
  row: (typeof DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE)[number],
  params: unknown,
): StillResult {
  const state = getEditState(session)
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

export const EDIT_NODE_TREE_STILLS: StillDefinition[] = SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.map((row) => ({
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
  execute: (session: IStillSession, params: unknown) => executeNodeTreeStillRow(session, row, params),
}))

export const EDIT_DATASET_STILLS: StillDefinition[] = DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE
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
    execute: (session: IStillSession, params: unknown) => executeDatasetStillRow(session, row, params),
  }))

export const EDIT_STILLS = [
  ...EDIT_LIFECYCLE_STILLS,
  ...EDIT_FILE_STILLS,
  ...EDIT_NODE_TREE_STILLS,
  ...EDIT_DATASET_STILLS,
] satisfies StillDefinition[]

export const editDomain: DomainProvider<EditDomainState> = {
  name: 'edit',
  roleHint: '编辑模式：对已有页面的 rule.json / pagedata.json / script.js / style.css 进行增量修改',
  stills: EDIT_STILLS,
  createState: createEditState,
}

