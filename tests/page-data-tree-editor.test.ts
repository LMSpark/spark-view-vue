import { describe, expect, it } from 'vitest'

import {
  addChildNode,
  buildTreeModel,
  exportJsonDocument,
  filterTreeNodes,
  resolveSchemaInfoForPath,
  rootOf,
  toDisplayRows,
  type JsonObject,
  type TreeModel,
} from '@spark-view/spark-component'
import { PAGE_DATA_JSON_SCHEMA } from '../src/views/app/dev-system/policies/pageDataJsonSchema'
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

/** 按路径段查找节点 id */
function findId(model: TreeModel, path: Array<string | number>): string {
  let id = rootOf(model)
  for (const seg of path) {
    let found: string | undefined
    for (const node of model.values()) {
      if (node.parentId === id && node.segment === seg) { found = node.id; break }
    }
    if (!found) throw new Error(`Path segment "${String(seg)}" not found`)
    id = found
  }
  return id
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
    const rows = toDisplayRows(buildTreeModel(createSamplePageData(), pageDataPolicy), pageDataPolicy)
    const filtered = filterTreeNodes(rows, (row) => row.segment === 'columns')

    // 平坦行模型：命中行 + 所有祖先行均被保留
    const segments = filtered.map((r) => r.segment)
    expect(segments).toContain('pagedata')
    expect(segments).toContain('tables')
    expect(segments).toContain('Users')
    expect(segments).toContain('columns')

    // columns 的 parentId 应指向 Users 行
    const columnsRow = filtered.find((r) => r.segment === 'columns')
    const usersRow = filtered.find((r) => r.segment === 'Users')
    expect(columnsRow?.parentId).toBe(usersRow?.id)
  })

  it('should add semantic default nodes for tables and relations', () => {
    const sample = createSamplePageData()
    const model = buildTreeModel(sample, pageDataPolicy)

    const tablesId = findId(model, ['tables'])
    const result = addChildNode(model, tablesId, pageDataPolicy)
    const doc = exportJsonDocument(result.model) as JsonObject
    const nextTables = doc['tables'] as Record<string, JsonObject>
    const newTableEntry = Object.entries(nextTables).find(([key]) => key !== 'Users')

    expect(newTableEntry).toBeDefined()
    expect(newTableEntry?.[1]).toMatchObject({
      columns: [],
      views: { default: {} },
    })

    const relId = findId(model, ['tableRelations'])
    const relResult = addChildNode(model, relId, pageDataPolicy)
    const relDoc = exportJsonDocument(relResult.model) as JsonObject
    expect(relDoc['tableRelations']).toEqual([
      {
        parentTable: 'ParentTable',
        childTable: 'ChildTable',
        parentField: 'id',
        childField: 'parentId',
      },
    ])
  })
})