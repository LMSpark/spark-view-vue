import { describe, expect, it } from 'vitest'
import { createPermissionChecker } from '../packages/spark-data/src/permission/PermissionChecker'
import type { IDataRow } from '../packages/spark-data/src/types'

describe('PermissionChecker', () => {
  it('treats missing editableFields as editable to match UI permission semantics', () => {
    const checker = createPermissionChecker()
    const row = { id: 1, _perm: {} } as IDataRow

    expect(checker.canEdit(row)).toBe(true)
  })

  it('treats empty editableFields as not editable', () => {
    const checker = createPermissionChecker()
    const row = { id: 2, _perm: { editableFields: [] } } as IDataRow

    expect(checker.canEdit(row)).toBe(false)
  })
})