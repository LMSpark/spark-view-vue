import type { IDataRow, IModelPermission } from '../types'
import { createFieldRenderHelper } from './FieldRenderHelper'
import type { IFieldRenderConfig, IFieldRenderState } from './FieldRenderHelper'
import { createPermissionChecker } from './PermissionChecker'

export interface PermissionActionContext {
  modelPermission?: IModelPermission
  row?: IDataRow | null
}

const checker = createPermissionChecker()
const fieldRenderHelper = createFieldRenderHelper()

function hasOwnContext<T extends object, K extends PropertyKey>(value: T, key: K): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function isPermittedAction(
  action: string | undefined,
  context: PermissionActionContext,
): boolean {
  if (action === undefined) return true

  const hasModelPermission = hasOwnContext(context, 'modelPermission')
  const hasRow = hasOwnContext(context, 'row')

  switch (action) {
    case 'create':
      return hasModelPermission && checker.canCreate(context.modelPermission)
    case 'import':
      return hasModelPermission && checker.canImport(context.modelPermission)
    case 'export':
      return hasModelPermission && checker.canExport(context.modelPermission)
    case 'create-child':
      return (hasModelPermission ? checker.canCreate(context.modelPermission) : true)
        && (hasRow ? !!context.row && checker.canCreateChild(context.row) : true)
    case 'delete':
      return hasRow && !!context.row && checker.canDelete(context.row)
    case 'edit':
      return hasRow && !!context.row && checker.canEdit(context.row)
    default:
      return true
  }
}

export function resolveFieldPermissionState(
  field: string | undefined,
  row: IDataRow | null | undefined,
  config: Omit<IFieldRenderConfig, 'field'> = {},
): IFieldRenderState | null {
  if (!field || !row) return null
  return fieldRenderHelper.computeFieldState({ field, ...config }, row, checker)
}

export function formatPermissionAwareFieldValue(
  field: string | undefined,
  value: unknown,
  row: IDataRow | null | undefined,
  formatDisplay?: (value: unknown) => string,
): string {
  const formatter = formatDisplay ?? ((nextValue: unknown) => String(nextValue ?? ''))
  if (!field || !row) return formatter(value)

  const state = resolveFieldPermissionState(field, row)
  if (!state) return formatter(value)
  return formatter(value)
}