/**
 * Edit — DataSetCrudTool Stills
 *
 * 由 DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE catalog 驱动。
 * 本文件自包含 catalog → StillDefinition 的投影逻辑。
 */

import type { IStillSession, StillDefinition, StillResult } from '../../../../../core/stills/types'
import { parseDataKey } from '@spark-view/spark-data'
import { getActiveDataSetTool, getEditState, notifyDataSetChanged } from '../edit-lifecycle-stills'
import { EDIT_BOOTSTRAP_ACTION } from '../../../../../core/stills/action-names'
import {
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE,
  validateDataSetCrudToolStillParams,
} from '../../dataset-crud-tool-stills-catalog'

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

const LEGACY_DATASET_EXPORT_ACTION = 'datasetTool.export'

const LEGACY_DATASET_AGGREGATE_ACTIONS = new Set([
  'datasetTool.listAggregates',
  'datasetTool.getAggregate',
  'datasetTool.addAggregate',
  'datasetTool.updateAggregate',
  'datasetTool.removeAggregate',
])

function isEditDatasetStillActionEnabled(action: string): boolean {
  return action !== LEGACY_DATASET_EXPORT_ACTION && !LEGACY_DATASET_AGGREGATE_ACTIONS.has(action)
}

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
 *
 * 原因是编辑态直接操作 live model，不再通过“导出动作”把结果回写给宿主。
 */
function validateDatasetStillRow(
  row: (typeof DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE)[number],
  params: unknown,
): string | null {
  if (row.action === 'datasetTool.export') {
    return '编辑模式直接操作 live DataSet，禁止使用 datasetTool.export；请改用 datasetTool.describe/listTables/getTable 等当前态读取动作'
  }
  return validateDataSetCrudToolStillParams(row.action, params ?? {})
}

type NodeTreeDataKeyValidationIssue = {
  dataKey: string
  code: 'INVALID_DATAKEY' | 'UNSUPPORTED_SCOPE' | 'UNKNOWN_TABLE' | 'UNKNOWN_VIEW' | 'UNKNOWN_FIELD_PATH'
  detail: string
}

type SparkNodeTreeLike = {
  getAllData(): unknown
}

function collectDataKeysFromNode(node: unknown, out: Set<string>): void {
  if (typeof node !== 'object' || node === null) return
  const record = node as Record<string, unknown>

  const props = record['props']
  if (typeof props === 'object' && props !== null) {
    const dataKey = (props as Record<string, unknown>)['dataKey']
    if (typeof dataKey === 'string' && dataKey.trim().length > 0) {
      out.add(dataKey.trim())
    }
  }

  const children = record['children']
  if (!Array.isArray(children)) return
  for (const child of children) {
    collectDataKeysFromNode(child, out)
  }
}

function buildDataKeyValidationMessage(issues: NodeTreeDataKeyValidationIssue[]): string {
  const preview = issues
    .slice(0, 8)
    .map((item) => `[${item.code}] ${item.dataKey} -> ${item.detail}`)
    .join('；')
  const suffix = issues.length > 8 ? `；其余 ${issues.length - 8} 项请分批修复` : ''
  return `DataKey 分段校验失败（${issues.length} 项）：${preview}${suffix}`
}

/**
 * 对当前 nodeTree 中全部 props.dataKey 执行“分段存在性”校验。
 *
 * 校验项：
 * 1. 语法可被 parseDataKey 解析；
 * 2. 禁止跨页 scope（编辑态只校验当前页面 DataSet）；
 * 3. table/view 必须真实存在；
 * 4. fieldPath 首段必须是列名或聚合输出键。
 */
export function validateNodeTreeDataKeysByDatasetEdit(
  session: IStillSession,
  nodeTree: SparkNodeTreeLike,
): string | null {
  const state = getEditState(session)
  const tool = getActiveDataSetTool(state)
  if (!tool) {
    return `datasetEdit 未初始化，无法校验 dataKey；请先执行 ${EDIT_BOOTSTRAP_ACTION}`
  }

  const root = nodeTree.getAllData()
  const dataKeys = new Set<string>()
  collectDataKeysFromNode(root, dataKeys)
  if (dataKeys.size === 0) return null

  const tableNames = new Set(tool.listTables().map((table) => table.tableName))
  const issues: NodeTreeDataKeyValidationIssue[] = []

  for (const dataKey of dataKeys) {
    const descriptor = parseDataKey(dataKey)
    if (!descriptor) {
      issues.push({
        dataKey,
        code: 'INVALID_DATAKEY',
        detail: '语法无效，无法解析为 table@view@field（或合法简写）',
      })
      continue
    }

    if (descriptor.crossPage === true || descriptor.scope !== undefined) {
      issues.push({
        dataKey,
        code: 'UNSUPPORTED_SCOPE',
        detail: `编辑态仅校验当前页面 DataSet，暂不接受跨页 scope: #${descriptor.scope ?? ''}`,
      })
      continue
    }

    if (!tableNames.has(descriptor.tableName)) {
      issues.push({
        dataKey,
        code: 'UNKNOWN_TABLE',
        detail: `table 不存在: ${descriptor.tableName}`,
      })
      continue
    }

    const view = tool.getView({ tableName: descriptor.tableName, viewId: descriptor.viewId })
    if (!view) {
      issues.push({
        dataKey,
        code: 'UNKNOWN_VIEW',
        detail: `view 不存在: ${descriptor.tableName}@${descriptor.viewId}`,
      })
      continue
    }

    if (descriptor.fieldPath !== undefined) {
      const rootField = descriptor.fieldPath.split('.')[0]?.trim()
      if (!rootField) continue

      const column = tool.getColumn({ tableName: descriptor.tableName, columnName: rootField })
      if (column) continue

      const aggregateKeys = new Set(Object.keys(view.aggregates))
      if (aggregateKeys.has(rootField)) continue

      issues.push({
        dataKey,
        code: 'UNKNOWN_FIELD_PATH',
        detail: `fieldPath 首段不存在: ${rootField}（既不是列，也不是聚合输出键）`,
      })
    }
  }

  return issues.length === 0 ? null : buildDataKeyValidationMessage(issues)
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
 * 5. 统一把运行时异常折叠为 StillResult，避免异常逃逸到主循环。
 */
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
      fix: `请先执行 ${EDIT_BOOTSTRAP_ACTION}`,
    }
  }

  try {
    const member = (tool as unknown as Record<string, unknown>)[row.crudToolMethod]
    if (typeof member !== 'function') {
      return {
        ok: false,
        code: 'METHOD_NOT_FOUND',
        msg: `datasetTool 动作 ${row.action} 指向的 DataSetCrudTool.${row.crudToolMethod} 不存在`,
        fix: '请改用当前已注册且有实现的 datasetTool 动作；视图聚合配置请使用 datasetTool.updateView。',
      }
    }

    const rawData = (member as DispatchFn).call(tool, ...resolveDispatchArgs(row.action, params))
    const data = stripLayoutField(rawData)

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
const EDIT_DATASET_STILLS_RAW: StillDefinition[] = DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE.map((row) => ({
  action: row.action,
  type: row.type,
  description: row.description,
  paramsSchema: row.paramsSchema,
  resultSchema: row.resultSchema,
  example: row.example,
  usageRules: row.usageRules,
  failureModes: row.failureModes,
  validate: (params: unknown) => validateDatasetStillRow(row, params),
  execute: (session: IStillSession, params: unknown) => executeDatasetStillRow(session, row, params),
} as StillDefinition))

const datasetExportRow = DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE.find(
  (row) => row.action === LEGACY_DATASET_EXPORT_ACTION,
)

const BLOCKED_LEGACY_DATASET_EXPORT_STILL: StillDefinition | null = datasetExportRow === undefined
  ? null
  : {
    action: LEGACY_DATASET_EXPORT_ACTION,
    type: 'describe',
    description: '已禁用：编辑模式不通过导出动作回写 pagedata.json',
    paramsSchema: {},
    resultSchema: {},
    example: {},
    usageRules: [
      '编辑模式直接操作 live DataSet，禁止调用 datasetTool.export。',
      '如需读取当前态，请调用 datasetTool.describe、datasetTool.listTables 或 datasetTool.getTable。',
    ],
    validate: () => '编辑模式直接操作 live DataSet，禁止使用 datasetTool.export；请改用当前态读取动作',
    execute: (): StillResult => ({
      ok: false,
      code: 'INVALID_PARAMS',
      msg: '编辑模式禁止使用 datasetTool.export',
      fix: '请改用 datasetTool.describe、datasetTool.listTables 或 datasetTool.getTable 读取当前态。',
    }),
  }

export const EDIT_DATASET_STILLS_EFFECTIVE: StillDefinition[] = (
  BLOCKED_LEGACY_DATASET_EXPORT_STILL === null
    ? EDIT_DATASET_STILLS_RAW.filter((still) => isEditDatasetStillActionEnabled(still.action))
    : [
      ...EDIT_DATASET_STILLS_RAW.filter((still) => isEditDatasetStillActionEnabled(still.action)),
      BLOCKED_LEGACY_DATASET_EXPORT_STILL,
    ]
)

export const EDIT_DATASET_STILLS: StillDefinition[] = EDIT_DATASET_STILLS_EFFECTIVE

