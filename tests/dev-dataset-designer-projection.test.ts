import { describe, expect, it } from 'vitest'
import type { IDataSetMetadata } from '@spark-view/spark-data'
import {
  buildDataSetMetadataFromDesignerProjection,
  hasDesignerProjectionChanges,
  projectDesignerRelations,
  projectDesignerTables,
  reconcileDesignerTableUiState,
  type DesignerTableProjection,
} from '../src/views/app/dev-system/composables/designerProjection'

function createMetadata(partial?: Partial<IDataSetMetadata>): IDataSetMetadata {
  return {
    dataSetName: 'sales',
    tables: {
      users: {
        tableName: 'users',
        resourceType: 'database',
        views: { default: { rows: [] } },
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'name', type: 'string' },
        ],
      },
      orders: {
        tableName: 'orders',
        resourceType: 'database',
        views: { default: { rows: [] } },
        columns: [
          { name: 'id', type: 'string', isPrimaryKey: true },
          { name: 'userId', type: 'string' },
        ],
      },
    },
    tableRelations: [
      {
        parentTable: 'users',
        childTable: 'orders',
        parentField: 'id',
        childField: 'userId',
      },
    ],
    ...partial,
  }
}

describe('DevDataSetDesigner projection helpers', () => {
  it('keeps existing table and column ids while assigning layout only to new tables', () => {
    const existingTables: DesignerTableProjection[] = [
      {
        id: 'table-users',
        tableName: 'users',
        resourceType: 'database',
        x: 120,
        y: 180,
        views: { default: { rows: [] } },
        columns: [
          { id: 'col-users-id', name: 'id', type: 'string', isPrimaryKey: true },
          { id: 'col-users-name', name: 'name', type: 'string' },
        ],
      },
    ]
    const metadata = createMetadata({
      layout: {
        tablePositions: {
          users: { x: 120, y: 180 },
        },
      },
    })
    let nextId = 0
    const createId = () => `generated-${++nextId}`

    const nextUiState = reconcileDesignerTableUiState(
      metadata,
      existingTables,
      createId,
      (tableName, newIndex) => ({ x: 500 + newIndex * 100, y: tableName.length * 10 }),
    )
    const projectedTables = projectDesignerTables(metadata, nextUiState, createId)

    expect(nextUiState['users']).toEqual({
      id: 'table-users',
      x: 120,
      y: 180,
      columnIds: {
        id: 'col-users-id',
        name: 'col-users-name',
      },
    })
    expect(nextUiState['orders']).toEqual({
      id: 'generated-1',
      x: 500,
      y: 60,
      columnIds: {
        id: 'generated-2',
        userId: 'generated-3',
      },
    })

    expect(projectedTables[0]?.id).toBe('table-users')
    expect(projectedTables[0]?.columns.map((column) => column.id)).toEqual(['col-users-id', 'col-users-name'])
    expect(projectedTables[1]?.id).toBe('generated-1')
    expect(projectedTables[1]?.columns.map((column) => column.id)).toEqual(['generated-2', 'generated-3'])
  })

  it('compares persisted metadata by normalized projection output', () => {
    const metadata = createMetadata()
    const uiState = {
      users: {
        id: 'table-users',
        x: 120,
        y: 180,
        columnIds: {
          id: 'col-users-id',
          name: 'col-users-name',
        },
      },
      orders: {
        id: 'table-orders',
        x: 420,
        y: 180,
        columnIds: {
          id: 'col-orders-id',
          userId: 'col-orders-userId',
        },
      },
    }
    const createId = () => {
      throw new Error('unexpected createId call')
    }
    const projectedTables = projectDesignerTables(metadata, uiState, createId)
    const projectedRelations = projectDesignerRelations(metadata)

    const persisted = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: projectedTables,
      relations: projectedRelations,
    })
    const changed = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: [
        {
          ...projectedTables[0]!,
          resourceId: 'users-v2',
        },
        projectedTables[1]!,
      ],
      relations: projectedRelations,
    })

    expect(hasDesignerProjectionChanges(persisted, persisted)).toBe(false)
    expect(hasDesignerProjectionChanges(changed, persisted)).toBe(true)
  })

  it('does not treat implicit default layout or preserved pageId as unsaved changes', () => {
    const metadata = createMetadata({
      pageId: 'page-001',
    })
    let nextId = 0
    const projectedTables = projectDesignerTables(metadata, {}, () => `generated-${++nextId}`)
    const projectedRelations = projectDesignerRelations(metadata)

    const current = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: projectedTables,
      relations: projectedRelations,
    })
    const moved = buildDataSetMetadataFromDesignerProjection({
      dataSetName: metadata.dataSetName,
      tables: [
        {
          ...projectedTables[0]!,
          x: projectedTables[0]!.x + 24,
        },
        projectedTables[1]!,
      ],
      relations: projectedRelations,
    })

    expect(hasDesignerProjectionChanges(current, metadata)).toBe(false)
    expect(hasDesignerProjectionChanges(moved, metadata)).toBe(true)
  })

})