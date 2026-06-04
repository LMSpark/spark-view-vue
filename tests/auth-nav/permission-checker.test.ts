import { describe, expect, it } from 'vitest'
import { permission } from '../../packages/spark-component/src/index'
import type { DataRow } from '@spark-appworks/spark-data'

const { canCreate, canImport, canExport, canDelete, canCreateChild, canEdit } = permission

describe('PermissionChecker', () => {
  it('defaults rows without snapshot to baseline allow (max(baseline, snapshot))', () => {
    const rowWithoutPerm: DataRow = { id: 1 }
    const rowWithEmptyPerm: DataRow = { id: 2, _perm: {} }

    // 未声明 editableFields → 基线允许
    expect(canEdit(rowWithoutPerm)).toBe(true)
    expect(canEdit(rowWithEmptyPerm)).toBe(true)
  })

  it('treats empty editableFields as explicit deny', () => {
    const row: DataRow = { id: 3, _perm: { editableFields: [] } }

    expect(canEdit(row)).toBe(false)
  })

  it('uses max(baseline=allow, snapshot) — only explicit false denies', () => {
    const modelPerm = { allowCreate: true, allowImport: true, allowExport: true }
    const writableRow: DataRow = { id: 4, _perm: { editableFields: ['name'], allowDelete: true, allowCreateChild: true } }
    const rowWithoutPerm: DataRow = { id: 5 }
    const explicitDenyRow: DataRow = { id: 6, _perm: { allowDelete: false, allowCreateChild: false } }

    expect(canCreate(modelPerm)).toBe(true)
    expect(canImport(modelPerm)).toBe(true)
    expect(canExport(modelPerm)).toBe(true)
    // 缺省模型权限 → 基线允许
    expect(canCreate(undefined)).toBe(true)
    expect(canImport(undefined)).toBe(true)
    expect(canExport(undefined)).toBe(true)
    expect(canDelete(writableRow)).toBe(true)
    expect(canCreateChild(writableRow)).toBe(true)
    // 行无 _perm → 基线允许
    expect(canDelete(rowWithoutPerm)).toBe(true)
    expect(canCreateChild(rowWithoutPerm)).toBe(true)
    // 显式 false → 拒绝
    expect(canDelete(explicitDenyRow)).toBe(false)
    expect(canCreateChild(explicitDenyRow)).toBe(false)
  })
})
