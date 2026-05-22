import { describe, expect, it } from 'vitest'

import {
  flattenJsonDocumentForEdit,
  restoreJsonDocumentByOriginalType,
  restoreJsonDocumentFromFlat,
  type FlatJsonTreeDocument,
  type JsonDocument,
} from '@spark-view/spark-page-config/capabilities/json-document'

describe('jsonTreeEditor flat uuid pipeline', () => {
  it('should round-trip object root document', () => {
    const doc: JsonDocument = {
      name: 'a',
      children: [
        { name: 'b', value: 1 },
        {
          name: 'c',
          children: [{ name: 'd', value: 2 }],
        },
      ],
    }

    const flat = flattenJsonDocumentForEdit(doc)
    const restored = restoreJsonDocumentFromFlat(flat)

    expect(flat.rootType).toBe('object')
    expect(restored).toEqual(doc)
  })

  it('should round-trip array root document', () => {
    const doc: JsonDocument = [
      {
        name: 'a',
        children: [{ name: 'b', value: 1 }],
      },
      {
        name: 'c',
        value: 2,
      },
    ]

    const flat = flattenJsonDocumentForEdit(doc)
    const restored = restoreJsonDocumentFromFlat(flat)

    expect(flat.rootType).toBe('array')
    expect(Array.isArray(restored)).toBe(true)
    expect(restored).toEqual(doc)
  })

  it('should rebuild array siblings by order field', () => {
    const doc: JsonDocument = [
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]

    const flat = flattenJsonDocumentForEdit(doc)
    const reordered = flat.rows.map((row) => {
      if (row.parentId !== null || typeof row.segment !== 'number') return row
      if (row.segment === 0) return { ...row, order: 2 }
      if (row.segment === 1) return { ...row, order: 0 }
      if (row.segment === 2) return { ...row, order: 1 }
      return row
    })

    const restored = restoreJsonDocumentFromFlat({
      rootType: flat.rootType,
      rows: reordered,
    })

    expect(restored).toEqual([
      { name: 'b' },
      { name: 'c' },
      { name: 'a' },
    ])
  })

  it('should keep original root type when restoring by originalData', () => {
    const originalObject: JsonDocument = { name: 'root' }
    const flatObject = flattenJsonDocumentForEdit(originalObject)

    const restoredObject = restoreJsonDocumentByOriginalType(flatObject.rows, originalObject)
    expect(Array.isArray(restoredObject)).toBe(false)
    expect(restoredObject).toEqual(originalObject)

    const originalArray: JsonDocument = [{ name: 'root' }]
    const flatArray = flattenJsonDocumentForEdit(originalArray)

    const restoredArray = restoreJsonDocumentByOriginalType(flatArray.rows, originalArray)
    expect(Array.isArray(restoredArray)).toBe(true)
    expect(restoredArray).toEqual(originalArray)
  })

  it('should fail-fast when parent node is missing', () => {
    const broken: FlatJsonTreeDocument = {
      rootType: 'array',
      rows: [
        {
          id: 'n1',
          parentId: 'missing-parent',
          segment: 0,
          type: 'number',
          value: 1,
          order: 0,
        },
      ],
    }

    expect(() => restoreJsonDocumentFromFlat(broken)).toThrow('missing parent')
  })
})
