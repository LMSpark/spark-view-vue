import { describe, expect, it } from 'vitest'
import { permission } from '../packages/spark-component/src/index'
import type { IDataRow } from '../packages/spark-data/src/types'

const { createPermissionChecker } = permission

describe('PermissionChecker', () => {
  it('defaults rows without editableFields permission data to readonly', () => {
    const checker = createPermissionChecker()
    const rowWithoutPerm = { id: 1 } as IDataRow
    const rowWithEmptyPerm = { id: 2, _perm: {} } as IDataRow

    expect(checker.canEdit(rowWithoutPerm)).toBe(false)
    expect(checker.canEdit(rowWithEmptyPerm)).toBe(false)
  })

  it('treats empty editableFields as not editable', () => {
    const checker = createPermissionChecker()
    const row = { id: 3, _perm: { editableFields: [] } } as IDataRow

    expect(checker.canEdit(row)).toBe(false)
  })

  it('requires explicit model and row write permissions', () => {
    const checker = createPermissionChecker()
    const modelPerm = { allowCreate: true, allowImport: true, allowExport: true }
    const writableRow = { id: 4, _perm: { editableFields: ['name'], allowDelete: true, allowCreateChild: true } } as IDataRow
    const readonlyRow = { id: 5 } as IDataRow

    expect(checker.canCreate(modelPerm)).toBe(true)
    expect(checker.canImport(modelPerm)).toBe(true)
    expect(checker.canExport(modelPerm)).toBe(true)
    expect(checker.canCreate(undefined)).toBe(false)
    expect(checker.canImport(undefined)).toBe(false)
    expect(checker.canExport(undefined)).toBe(false)
    expect(checker.canDelete(writableRow)).toBe(true)
    expect(checker.canCreateChild(writableRow)).toBe(true)
    expect(checker.canDelete(readonlyRow)).toBe(false)
    expect(checker.canCreateChild(readonlyRow)).toBe(false)
  })
})