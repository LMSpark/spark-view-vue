import { describe, expect, it } from 'vitest'
import type { IDataRow } from '@spark-view/spark-data'
import { permission } from '../packages/spark-component/src/index'

const { filterDisplayableFields } = permission

describe('PermissionFilter', () => {
  it('keeps backend-masked values and removes hidden fields', () => {
    const row = {
      id: 1,
      phone: '138****1234',
      secret: 'top-secret',
      _perm: {
        maskedFields: ['phone'],
        hiddenFields: ['secret'],
      },
    } as IDataRow

    const filtered = filterDisplayableFields(row)

    expect(filtered['phone']).toBe('138****1234')
    expect(filtered).not.toHaveProperty('secret')
  })
})