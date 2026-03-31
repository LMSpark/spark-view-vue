import { describe, expect, it } from 'vitest'
import { permission } from '../packages/spark-component/src/index'
import type { IDataRow } from '../packages/spark-data/src/types'

const { canCreate, canImport, canExport, canDelete, canCreateChild, canEdit } = permission

describe('PermissionChecker', () => {
  it('defaults rows without editableFields permission data to readonly', () => {
    const rowWithoutPerm = { id: 1 } as IDataRow
    const rowWithEmptyPerm = { id: 2, _perm: {} } as IDataRow

    expect(canEdit(rowWithoutPerm)).toBe(false)
    expect(canEdit(rowWithEmptyPerm)).toBe(false)
  })

  it('treats empty editableFields as not editable', () => {
    const row = { id: 3, _perm: { editableFields: [] } } as IDataRow

    expect(canEdit(row)).toBe(false)
  })

  it('requires explicit model and row write permissions', () => {
    const modelPerm = { allowCreate: true, allowImport: true, allowExport: true }
    const writableRow = { id: 4, _perm: { editableFields: ['name'], allowDelete: true, allowCreateChild: true } } as IDataRow
    const readonlyRow = { id: 5 } as IDataRow

    expect(canCreate(modelPerm)).toBe(true)
    expect(canImport(modelPerm)).toBe(true)
    expect(canExport(modelPerm)).toBe(true)
    expect(canCreate(undefined)).toBe(false)
    expect(canImport(undefined)).toBe(false)
    expect(canExport(undefined)).toBe(false)
    expect(canDelete(writableRow)).toBe(true)
    expect(canCreateChild(writableRow)).toBe(true)
    expect(canDelete(readonlyRow)).toBe(false)
    expect(canCreateChild(readonlyRow)).toBe(false)
  })
})