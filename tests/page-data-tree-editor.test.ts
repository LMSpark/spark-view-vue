import { describe, expect, it } from 'vitest'

import { PAGE_DATA_JSON_SCHEMA } from '../src/views/app/dev-system/pageDataJsonSchema'
import {
  addChildNode,
  buildJsonTreeRows,
  filterJsonTreeRows,
  resolveSchemaInfoForPath,
  type JsonObject,
} from '../src/views/app/dev-system/jsonTreeEditor'
import { pageDataPolicy } from '../src/views/app/dev-system/policies/pageDataPolicy'

function createSamplePageData(): JsonObject {
  return {
    dataSetName: 'DemoDS',
    tables: {
      Users: {
        tableName: 'Users',
        columns: [
          { name: 'id', type: 'number', label: 'ID' },
        ],
        views: {
          default: {
            rows: [{ id: 1 }],
          },
        },
      },
    },
    tableRelations: [],
    viewDependencies: [],
  }
}

describe('jsonTreeEditor (pageData policy)', () => {
  it('should resolve schema info through additionalProperties and array items', () => {
    const tablesInfo = resolveSchemaInfoForPath(PAGE_DATA_JSON_SCHEMA, ['tables'])
    expect(tablesInfo.title).toBe('数据表集合')

    const columnNameInfo = resolveSchemaInfoForPath(PAGE_DATA_JSON_SCHEMA, ['tables', 'Users', 'columns', 0, 'name'])
    expect(columnNameInfo.title).toBe('列名')
    expect(columnNameInfo.required).toBe(true)

    const relationInfo = resolveSchemaInfoForPath(PAGE_DATA_JSON_SCHEMA, ['tableRelations', 0, 'parentTable'])
    expect(relationInfo.title).toBe('父表')
    expect(relationInfo.required).toBe(true)
  })

  it('should keep ancestors when filtering flat tree rows', () => {
    const rows = buildJsonTreeRows(createSamplePageData(), pageDataPolicy)
    const filtered = filterJsonTreeRows(rows, (row) => row.displayKey === 'columns')

    // 平坦行模型：命中行 + 所有祖先行均被保留
    const ids = filtered.map((r) => r.displayKey)
    expect(ids).toContain('pagedata')
    expect(ids).toContain('tables')
    expect(ids).toContain('Users')
    expect(ids).toContain('columns')

    // columns 的 parentId 应指向 Users 行
    const columnsRow = filtered.find((r) => r.displayKey === 'columns')
    const usersRow = filtered.find((r) => r.displayKey === 'Users')
    expect(columnsRow?.parentId).toBe(usersRow?.id)
  })

  it('should add semantic default nodes for tables and relations', () => {
    const sample = createSamplePageData()
    const withNewTable = addChildNode(sample, ['tables'], pageDataPolicy)
    const nextTables = withNewTable['tables'] as Record<string, JsonObject>
    const newTableEntry = Object.entries(nextTables).find(([key]) => key !== 'Users')

    expect(newTableEntry).toBeDefined()
    expect(newTableEntry?.[1]).toMatchObject({
      columns: [],
      views: { default: {} },
    })

    const withRelation = addChildNode(sample, ['tableRelations'], pageDataPolicy)
    expect(withRelation['tableRelations']).toEqual([
      {
        parentTable: 'ParentTable',
        childTable: 'ChildTable',
        parentField: 'id',
        childField: 'parentId',
      },
    ])
  })
})