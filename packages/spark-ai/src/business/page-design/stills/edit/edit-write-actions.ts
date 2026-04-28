import { DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE } from '../dataset-crud-tool-stills-catalog'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE } from '../spark-node-tree-tool-catalog'

const TEXT_MODEL_WRITE_ACTIONS = new Set<string>([
  'textModel.writeScript',
  'textModel.writeStyle',
])

const HIDDEN_DATASET_AGGREGATE_WRITE_ACTIONS = new Set<string>([
  'datasetTool.addAggregate',
  'datasetTool.updateAggregate',
  'datasetTool.removeAggregate',
])

const NODE_TREE_WRITE_ACTIONS = new Set<string>(
  SPARK_NODE_TREE_TOOL_PARAMETER_TABLE
    .filter((row) => row.type === 'request')
    .map((row) => row.action),
)

const DATASET_WRITE_ACTIONS = new Set<string>(
  DATASET_CRUD_TOOL_STILLS_PARAMETER_TABLE
    .filter((row) => row.type === 'request' && !HIDDEN_DATASET_AGGREGATE_WRITE_ACTIONS.has(row.action))
    .map((row) => row.action),
)

export function isEditNodeTreeWriteAction(action: string): boolean {
  return NODE_TREE_WRITE_ACTIONS.has(action)
}

export function isEditDataSetWriteAction(action: string): boolean {
  return DATASET_WRITE_ACTIONS.has(action)
}

export function isEditTextModelWriteAction(action: string): boolean {
  return TEXT_MODEL_WRITE_ACTIONS.has(action)
}

export function isEditWriteAction(action: string): boolean {
  return (
    isEditNodeTreeWriteAction(action)
    || isEditDataSetWriteAction(action)
    || isEditTextModelWriteAction(action)
  )
}
