import { describe, expect, it } from 'vitest'

import {
  addChildNode,
  buildTreeModel,
  exportJsonDocument,
  rootOf,
  toDisplayRows,
  type JsonDocument,
} from '@spark-view/spark-page-config/json-document'

describe('jsonTreeEditor (array root)', () => {
  it('should flatten and restore when document root is an array', () => {
    const doc: JsonDocument = [{ name: 'A' }, 2, true, null]

    const model = buildTreeModel(doc)
    const rows = toDisplayRows(model)

    expect(rows[0]?.type).toBe('array')
    expect(rows[0]?.depth).toBe(0)
    expect(rows[0]?.parentId).toBeNull()
    expect(rows.filter((row) => row.depth === 1).map((row) => row.segment)).toEqual([
      0,
      1,
      2,
      3,
    ])
    expect(exportJsonDocument(model)).toEqual(doc)
  })

  it('should append default item when adding child on array root', () => {
    const model = buildTreeModel([1])

    const result = addChildNode(model, rootOf(model))

    expect(exportJsonDocument(result.model)).toEqual([1, ''])
  })
})
