import { DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE } from '../../dataset'
import { SPARK_NODE_TREE_TOOL_PARAMETER_TABLE } from '../../node-tree'
import { TEXT_MODEL_FUNCTIONS_PARAMETER_TABLE } from '../../text-model'

const HIDDEN_DATASET_AGGREGATE_WRITE_METHODS = new Set(['addAggregate', 'updateAggregate', 'removeAggregate'])

export function isEditNodeTreeWriteAction(action: string): boolean {
  return SPARK_NODE_TREE_TOOL_PARAMETER_TABLE.some((row) => row.type === 'request' && row.action === action)
}

export function isEditDataSetWriteAction(action: string): boolean {
  return DATASET_CRUD_TOOL_FUNCTIONS_PARAMETER_TABLE.some(
    (row) => row.type === 'request'
      && row.action === action
      && !HIDDEN_DATASET_AGGREGATE_WRITE_METHODS.has(row.crudToolMethod),
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
