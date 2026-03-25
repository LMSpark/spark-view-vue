import type { SparkNode } from '../_pkg'
import { nodeInputProp } from '../_pkg'
import { createPermissionChecker } from '@spark-view/spark-data'
import type { IDataRow, IModelPermission } from '@spark-view/spark-data'

type RuntimeActionConfig = SparkNode & { display?: boolean }

const permissionChecker = createPermissionChecker()

export function isActionDisplayed(action: SparkNode): boolean {
  return (action as RuntimeActionConfig).display !== false
}

export function isModelActionAllowed(action: SparkNode, modelPerm: IModelPermission | undefined): boolean {
  const permAction = nodeInputProp(action, 'permAction') as string | undefined
  if (permAction === undefined) return true

  switch (permAction) {
    case 'create':
      return permissionChecker.canCreate(modelPerm)
    case 'import':
      return permissionChecker.canImport(modelPerm)
    case 'export':
      return permissionChecker.canExport(modelPerm)
    default:
      return true
  }
}

export function isRowActionAllowed(action: SparkNode, row: IDataRow | undefined): boolean {
  const permAction = nodeInputProp(action, 'permAction') as string | undefined
  if (!row) return true
  if (permAction === undefined) return true

  switch (permAction) {
    case 'delete':
      return permissionChecker.canDelete(row)
    case 'edit':
      return permissionChecker.canEdit(row)
    default:
      return true
  }
}