import { describe, expect, it } from 'vitest'
import {
  FieldVisibility,
  type IDataRow,
  type IModelPermission,
} from '@spark-view/spark-data'
import { permission } from '../packages/spark-component/src/index'

const {
  isPermittedAction,
  resolveFieldPermissionState,
} = permission

describe('PermissionResolver', () => {
  it('unifies model and row action permission decisions', () => {
    const modelPerm: IModelPermission = {
      allowCreate: false,
      allowImport: true,
      allowExport: false,
    }
    const editableRow = { id: 1, _perm: { editableFields: ['name'], allowDelete: true, allowCreateChild: false } } as IDataRow
    const lockedRow = { id: 2, _perm: { editableFields: [], allowDelete: false } } as IDataRow

    expect(isPermittedAction('create', { modelPermission: modelPerm })).toBe(false)
    expect(isPermittedAction('import', { modelPermission: modelPerm })).toBe(true)
    expect(isPermittedAction('export', { modelPermission: modelPerm })).toBe(false)
    expect(isPermittedAction('create-child', { row: editableRow })).toBe(false)
    expect(isPermittedAction('edit', { row: editableRow })).toBe(true)
    expect(isPermittedAction('delete', { row: lockedRow })).toBe(false)
  })

  it('defaults missing permission data to readonly for actions and fields', () => {
    const row = { id: 1, name: 'Alice' } as IDataRow

    const state = resolveFieldPermissionState('name', row)

    expect(isPermittedAction('create', {})).toBe(false)
    expect(isPermittedAction('import', {})).toBe(false)
    expect(isPermittedAction('export', {})).toBe(false)
    expect(isPermittedAction('edit', { row })).toBe(false)
    expect(isPermittedAction('delete', { row })).toBe(false)
    expect(isPermittedAction('create-child', { row })).toBe(false)
    expect(state?.readable).toBe(true)
    expect(state?.editable).toBe(false)
    expect(state?.visibility).toBe(FieldVisibility.Visible)
    expect(state?.shouldRender).toBe(true)
    expect(state?.displayValue).toBe('Alice')
  })

  it('does not treat empty values as hidden without an explicit hidden permission', () => {
    const row = { id: 1, name: '', _perm: { editableFields: [] } } as IDataRow

    const state = resolveFieldPermissionState('name', row)

    expect(state?.visibility).toBe(FieldVisibility.Visible)
    expect(state?.readable).toBe(true)
    expect(state?.shouldRender).toBe(true)
    expect(state?.displayValue).toBe('')
  })

  it('treats empty or missing values as hidden only when hiddenFields explicitly marks the field', () => {
    const row = { id: 1, _perm: { hiddenFields: ['name'], editableFields: [] } } as IDataRow

    const state = resolveFieldPermissionState('name', row)

    expect(state?.visibility).toBe(FieldVisibility.Hidden)
    expect(state?.readable).toBe(false)
    expect(state?.editable).toBe(false)
    expect(state?.shouldRender).toBe(false)
  })

  it('requires both model and row grants when create-child receives both contexts', () => {
    const modelPerm: IModelPermission = { allowCreate: true }
    const row = { id: 1, _perm: { allowCreateChild: true, editableFields: ['name'] } } as IDataRow
    const readonlyModel: IModelPermission = { allowCreate: false }

    expect(isPermittedAction('create-child', { modelPermission: modelPerm, row })).toBe(true)
    expect(isPermittedAction('create-child', { modelPermission: readonlyModel, row })).toBe(false)
  })

  it('returns hidden state for hidden fields and preserves backend-masked text', () => {
    const row = {
      id: 1,
      phone: '138****1234',
      secret: 'top-secret',
      _perm: {
        editableFields: ['phone'],
        hiddenFields: ['secret'],
        maskedFields: ['phone'],
      },
    } as IDataRow

    const hiddenState = resolveFieldPermissionState('secret', row)
    const maskedState = resolveFieldPermissionState('phone', row)

    expect(hiddenState?.visibility).toBe(FieldVisibility.Hidden)
    expect(hiddenState?.readable).toBe(false)
    expect(hiddenState?.shouldRender).toBe(false)
    expect(maskedState?.visibility).toBe(FieldVisibility.Masked)
    expect(maskedState?.readable).toBe(true)
    expect(maskedState?.editable).toBe(true)
    expect(maskedState?.displayValue).toBe('138****1234')
  })

  it('keeps read and write channels independent for hidden editable fields', () => {
    const row = {
      id: 1,
      password: 'secret-from-backend',
      _perm: {
        hiddenFields: ['password'],
        editableFields: ['password'],
      },
    } as IDataRow

    const state = resolveFieldPermissionState('password', row)

    expect(state?.visibility).toBe(FieldVisibility.Hidden)
    expect(state?.readable).toBe(false)
    expect(state?.editable).toBe(true)
    expect(state?.shouldRender).toBe(false)
  })
})