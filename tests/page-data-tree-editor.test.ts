import { describe, expect, it } from 'vitest'

import { PAGE_DATA_JSON_SCHEMA } from '../src/views/app/dev-system/pageDataJsonSchema'
import {
  addChildNode,
  buildPageDataTreeRows,
  filterPageDataTreeRows,
  resolveSchemaInfoForPath,
  type JsonObject,
} from '../src/views/app/dev-system/pageDataTreeEditor'

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

describe('pageDataTreeEditor', () => {
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

  it('should keep ancestors when filtering tree rows', () => {
    const rows = buildPageDataTreeRows(createSamplePageData())
    const filtered = filterPageDataTreeRows(rows, (row) => row.displayKey === 'columns')

    expect(filtered).toHaveLength(1)
    const root = filtered[0]
    if (!root) {
      throw new Error('根节点缺失')
    }

    expect(root.displayKey).toBe('pagedata')
    expect(root.children?.map((child) => child.displayKey)).toEqual(['tables'])
    expect(root.children?.[0]?.children?.map((child) => child.displayKey)).toEqual(['Users'])
    expect(root.children?.[0]?.children?.[0]?.children?.map((child) => child.displayKey)).toEqual(['columns'])

    const serializedKeys = JSON.stringify(filtered)
    expect(serializedKeys).toContain('tables')
    expect(serializedKeys).toContain('Users')
    expect(serializedKeys).toContain('columns')
  })

  it('should add semantic default nodes for tables and relations', () => {
    const sample = createSamplePageData()
    const withNewTable = addChildNode(sample, ['tables'])
    const nextTables = withNewTable['tables'] as Record<string, JsonObject>
    const newTableEntry = Object.entries(nextTables).find(([key]) => key !== 'Users')

    expect(newTableEntry).toBeDefined()
    expect(newTableEntry?.[1]).toMatchObject({
      columns: [],
      views: { default: {} },
    })

    const withRelation = addChildNode(sample, ['tableRelations'])
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