import { describe, expect, it } from 'vitest'
import type { DataColumn, IDataRow } from '@spark-view/spark-data'
import { createSchema, createValidator } from '../packages/spark-data/src/validation'

describe('computed column validation regression', () => {
  it('should not treat computed columns as required during CRUD validation', () => {
    const columns: DataColumn[] = [
      { name: 'id', type: 'string', allowDBNull: false },
      {
        name: 'editorProfileKey',
        type: 'string',
        computeExpression: "if (nodeKind === 'page') return 'page'; return 'container';",
      },
    ]

    const validator = createValidator(createSchema(columns))
    const result = validator.validate({ id: 'node-1', nodeKind: 'page' } as IDataRow)

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})