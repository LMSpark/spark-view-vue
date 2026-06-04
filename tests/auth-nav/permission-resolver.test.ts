import { describe, expect, it } from 'vitest'
import {
  FieldVisibility,
  type DataRow,
  type ModelPermission,
} from '@spark-appworks/spark-data'
import { permission } from '../../packages/spark-component/src/index'

const {
  isPermittedAction,
  resolveFieldPermissionState,
} = permission

describe('PermissionResolver', () => {
  it('unifies model and row action permission decisions', () => {
    const modelPerm: ModelPermission = {
      allowCreate: false,
      allowImport: true,
      allowExport: false,
    }
    const editableRow: DataRow = { id: 1, _perm: { editableFields: ['name'], allowDelete: true, allowCreateChild: false } }
    const lockedRow: DataRow = { id: 2, _perm: { editableFields: [], allowDelete: false } }

    expect(isPermittedAction('create', { modelPermission: modelPerm })).toBe(false)
    expect(isPermittedAction('import', { modelPermission: modelPerm })).toBe(true)
    expect(isPermittedAction('export', { modelPermission: modelPerm })).toBe(false)
    expect(isPermittedAction('create-child', { row: editableRow })).toBe(false)
    expect(isPermittedAction('edit', { row: editableRow })).toBe(true)
    expect(isPermittedAction('delete', { row: lockedRow })).toBe(false)
  })

  it('defaults missing permission data to baseline allow for actions; field editable still requires grant', () => {
    const row: DataRow = { id: 1, name: 'Alice' }

    const state = resolveFieldPermissionState({ field: 'name', row })

    // 缺省快照 → 基线允许（max(true, undefined) = true）
    expect(isPermittedAction('create', {})).toBe(true)
    expect(isPermittedAction('import', {})).toBe(true)
    expect(isPermittedAction('export', {})).toBe(true)
    expect(isPermittedAction('edit', { row })).toBe(true)
    expect(isPermittedAction('delete', { row })).toBe(true)
    expect(isPermittedAction('create-child', { row })).toBe(true)
    expect(state?.readable).toBe(true)
    // 字段级可编辑仍需 editableFields 显式授予
    expect(state?.editable).toBe(false)
    expect(state?.visibility).toBe(FieldVisibility.Visible)
    expect(state?.shouldRender).toBe(true)
    expect(state?.displayValue).toBe('Alice')
  })

  it('does not treat empty values as hidden without an explicit hidden permission', () => {
    const row: DataRow = { id: 1, name: '', _perm: { editableFields: [] } }

    const state = resolveFieldPermissionState({ field: 'name', row })

    expect(state?.visibility).toBe(FieldVisibility.Visible)
    expect(state?.readable).toBe(true)
    expect(state?.shouldRender).toBe(true)
    expect(state?.displayValue).toBe('')
  })

  it('treats empty or missing values as hidden only when hiddenFields explicitly marks the field', () => {
    const row: DataRow = { id: 1, _perm: { hiddenFields: ['name'], editableFields: [] } }

    const state = resolveFieldPermissionState({ field: 'name', row })

    expect(state?.visibility).toBe(FieldVisibility.Hidden)
    expect(state?.readable).toBe(false)
    expect(state?.editable).toBe(false)
    expect(state?.shouldRender).toBe(false)
  })

  it('requires both model and row grants when create-child receives both contexts', () => {
    const modelPerm: ModelPermission = { allowCreate: true }
    const row: DataRow = { id: 1, _perm: { allowCreateChild: true, editableFields: ['name'] } }
    const readonlyModel: ModelPermission = { allowCreate: false }

    expect(isPermittedAction('create-child', { modelPermission: modelPerm, row })).toBe(true)
    expect(isPermittedAction('create-child', { modelPermission: readonlyModel, row })).toBe(false)
  })

  it('returns hidden state for hidden fields and preserves backend-masked text', () => {
    const row: DataRow = {
      id: 1,
      phone: '138****1234',
      secret: 'top-secret',
      _perm: {
        editableFields: ['phone'],
        hiddenFields: ['secret'],
        maskedFields: ['phone'],
      },
    }

    const hiddenState = resolveFieldPermissionState({ field: 'secret', row })
    const maskedState = resolveFieldPermissionState({ field: 'phone', row })

    expect(hiddenState?.visibility).toBe(FieldVisibility.Hidden)
    expect(hiddenState?.readable).toBe(false)
    expect(hiddenState?.shouldRender).toBe(false)
    expect(maskedState?.visibility).toBe(FieldVisibility.Masked)
    expect(maskedState?.readable).toBe(true)
    expect(maskedState?.editable).toBe(true)
    expect(maskedState?.displayValue).toBe('138****1234')
  })

  it('keeps read and write channels independent for hidden editable fields', () => {
    const row: DataRow = {
      id: 1,
      password: 'secret-from-backend',
      _perm: {
        hiddenFields: ['password'],
        editableFields: ['password'],
      },
    }

    const state = resolveFieldPermissionState({ field: 'password', row })

    expect(state?.visibility).toBe(FieldVisibility.Hidden)
    expect(state?.readable).toBe(false)
    expect(state?.editable).toBe(true)
    expect(state?.shouldRender).toBe(false)
  })
})
