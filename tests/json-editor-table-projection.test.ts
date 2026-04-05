import { describe, expect, it } from 'vitest'

import {
  applyTableProjectionChange,
  createTableProjectionState,
  findSelectedArrayPath,
  formatJsonPath,
  type JSONEditorSelectionLike,
} from '../packages/spark-component/src/components/support/jsonEditorTableProjection'

describe('json editor table projection', () => {
  const rootContent = {
    json: {
      tables: {
        Users: {
          columns: [
            { name: 'id', type: 'number' },
            { name: 'name', type: 'string' },
          ],
          rows: [
            { id: 1, name: 'Alice' },
          ],
        },
      },
    },
  }

  it('finds the nearest selected array path from a nested value selection', () => {
    const selection: JSONEditorSelectionLike = {
      type: 'value',
      path: ['tables', 'Users', 'columns', 1, 'name'],
    }

    expect(findSelectedArrayPath(rootContent.json, selection)).toEqual(['tables', 'Users', 'columns'])
  })

  it('creates table projection content for a selected nested array', () => {
    const projection = createTableProjectionState(rootContent, ['tables', 'Users', 'columns'])

    expect(projection.projected).toBe(true)
    expect(projection.projectedPath).toEqual(['tables', 'Users', 'columns'])
    expect(projection.projectedContent).toEqual({
      json: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'string' },
      ],
    })
  })

  it('writes projected table edits back into the original JSON document', () => {
    const updated = applyTableProjectionChange(
      rootContent,
      ['tables', 'Users', 'columns'],
      {
        json: [
          { name: 'id', type: 'number' },
          { name: 'email', type: 'string' },
        ],
      },
    )

    expect(updated).toEqual({
      json: {
        tables: {
          Users: {
            columns: [
              { name: 'id', type: 'number' },
              { name: 'email', type: 'string' },
            ],
            rows: [
              { id: 1, name: 'Alice' },
            ],
          },
        },
      },
    })
  })

  it('formats projected array paths for user-facing hints', () => {
    expect(formatJsonPath(['tables', 'Users', 'columns'])).toBe('$.tables.Users.columns')
    expect(formatJsonPath(['tables', 'Users', 'rows', 0, 'user name'])).toBe('$.tables.Users.rows[0]["user name"]')
  })
})