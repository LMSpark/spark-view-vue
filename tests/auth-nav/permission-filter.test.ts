import { describe, expect, it } from 'vitest'
import type { DataRow } from '@spark-appworks/spark-data'
import { permission } from '../../packages/spark-component/src/index'

const { filterDisplayableFields } = permission

describe('PermissionFilter', () => {
  it('keeps backend-masked values and removes hidden fields', () => {
    const row: DataRow = {
      id: 1,
      phone: '138****1234',
      secret: 'top-secret',
      _perm: {
        maskedFields: ['phone'],
        hiddenFields: ['secret'],
      },
    }

    const filtered = filterDisplayableFields(row)

    expect(filtered['phone']).toBe('138****1234')
    expect(filtered).not.toHaveProperty('secret')
  })
})
