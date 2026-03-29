import type { SparkNode } from '../internal'
import { nodeInputProp } from '../internal'
import type { IDataRow, IModelPermission } from '@spark-view/spark-data'
import { isPermittedAction } from '@spark-view/spark-data'

type RuntimeActionConfig = SparkNode & { display?: boolean }

function isModelScopedPermAction(action: string | undefined): boolean {
  return action === 'create' || action === 'import' || action === 'export' || action === 'create-child'
}

function isRowScopedPermAction(action: string | undefined): boolean {
  return action === 'edit' || action === 'delete' || action === 'create-child'
}

export function isActionDisplayed(action: SparkNode): boolean {
  return (action as RuntimeActionConfig).display !== false
}

export function isModelActionAllowed(action: SparkNode, modelPerm: IModelPermission | undefined): boolean {
  const permAction = nodeInputProp(action, 'permAction') as string | undefined
  if (!isModelScopedPermAction(permAction)) return true
  return isPermittedAction(permAction, modelPerm ? { modelPermission: modelPerm } : {})
}

export function isRowActionAllowed(action: SparkNode, row: IDataRow | undefined): boolean {
  const permAction = nodeInputProp(action, 'permAction') as string | undefined
  if (!isRowScopedPermAction(permAction)) return true
  return isPermittedAction(permAction, { row: row ?? null })
}