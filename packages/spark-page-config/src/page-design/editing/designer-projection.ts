import type { DataColumn, IDataSetMetadata, ITableMetadata, TableRelation } from '@spark-view/spark-data'

export interface DesignerColumnProjection extends DataColumn {
  id: string
}

export interface DesignerTableProjection extends Omit<ITableMetadata, 'columns'> {
  id: string
  x: number
  y: number
  columns: DesignerColumnProjection[]
}

export interface DesignerRelationProjection extends TableRelation {
  relationType?: 'one-to-many' | 'one-to-one' | 'many-to-many'
}

export interface DesignerTableUiState {
  id: string
  x: number
  y: number
  columnIds: Record<string, string>
}

export type LayoutForNewTable = (tableName: string, newIndex: number) => { x: number; y: number }

function getDefaultTablePosition(index: number): { x: number; y: number } {
  return {
    x: 50 + (index % 3) * 220,
    y: 50 + Math.floor(index / 3) * 200,
  }
}

export function reconcileDesignerTableUiState(
  metadata: IDataSetMetadata,
  currentTables: ReadonlyArray<Pick<DesignerTableProjection, 'tableName' | 'id' | 'x' | 'y' | 'columns'>>,
  createId: () => string,
  layoutForNewTable?: LayoutForNewTable,
): Record<string, DesignerTableUiState> {
  const oldByName = new Map(currentTables.map(table => [table.tableName, table]))
  const persistedPositions = metadata.layout?.tablePositions
  const nextUiState: Record<string, DesignerTableUiState> = {}
  let newTableCount = 0

  Object.entries(metadata.tables).forEach(([tableName, tableConfig], idx) => {
    const oldTable = oldByName.get(tableName)
    const oldColumnIdMap = new Map((oldTable?.columns ?? []).map(col => [col.name, col.id]))
    const defaultLayout = getDefaultTablePosition(idx)
    const newLayout = layoutForNewTable?.(tableName, newTableCount) ?? defaultLayout
    const persistedLayout = persistedPositions?.[tableName]
    if (!oldTable) newTableCount += 1

    nextUiState[tableName] = {
      id: oldTable?.id ?? createId(),
      x: persistedLayout?.x ?? oldTable?.x ?? newLayout.x,
      y: persistedLayout?.y ?? oldTable?.y ?? newLayout.y,
      columnIds: Object.fromEntries(
        tableConfig.columns.map((column) => [column.name, oldColumnIdMap.get(column.name) ?? createId()]),
      ),
    }
  })

  return nextUiState
}

export function projectDesignerTables(
  metadata: IDataSetMetadata,
  tableUiState: Record<string, DesignerTableUiState>,
  createId: () => string,
): DesignerTableProjection[] {
  return Object.entries(metadata.tables).map(([tableName, tableConfig], idx) => {
    const uiState = tableUiState[tableName]
    const persistedLayout = metadata.layout?.tablePositions?.[tableName]
    const defaultLayout = getDefaultTablePosition(idx)
    const columnIds = uiState?.columnIds ?? {}

    return {
      id: uiState?.id ?? createId(),
      x: uiState?.x ?? persistedLayout?.x ?? defaultLayout.x,
      y: uiState?.y ?? persistedLayout?.y ?? defaultLayout.y,
      ...tableConfig,
      columns: tableConfig.columns.map((column) => ({
        id: columnIds[column.name] ?? createId(),
        ...column,
      })),
    }
  })
}

export function projectDesignerRelations(metadata: IDataSetMetadata): DesignerRelationProjection[] {
  return (metadata.tableRelations ?? []).map((rel) => ({
    ...rel,
    relationType: 'one-to-many',
  }))
}

export function buildDataSetMetadataFromDesignerProjection(params: {
  dataSetName: string
  tables: readonly DesignerTableProjection[]
  relations: readonly DesignerRelationProjection[]
  viewDependencies?: NonNullable<IDataSetMetadata['viewDependencies']>
}): IDataSetMetadata {
  const tablesObj: Record<string, ITableMetadata> = {}
  const tablePositions: Record<string, { x: number; y: number }> = {}

  for (const table of params.tables) {
    const { id: _id, x: _x, y: _y, columns: designerCols, ...tableRest } = table
    const columns: DataColumn[] = designerCols.map(({ id: _cid, ...col }) => col)
    tablesObj[table.tableName] = { ...tableRest, columns }
    tablePositions[table.tableName] = { x: table.x, y: table.y }
  }

  return {
    dataSetName: params.dataSetName,
    tables: tablesObj,
    tableRelations: params.relations.map((rel) => ({
      parentTable: rel.parentTable,
      childTable: rel.childTable,
      ...(rel.parentField !== undefined ? { parentField: rel.parentField } : {}),
      ...(rel.childField !== undefined ? { childField: rel.childField } : {}),
      ...(rel.relationName !== undefined ? { relationName: rel.relationName } : {}),
      ...(rel.condition !== undefined ? { condition: rel.condition } : {}),
      ...(rel.cascadeUpdate !== undefined ? { cascadeUpdate: rel.cascadeUpdate } : {}),
      ...(rel.cascadeDelete !== undefined ? { cascadeDelete: rel.cascadeDelete } : {}),
    })),
    ...(params.viewDependencies !== undefined ? { viewDependencies: params.viewDependencies } : {}),
    layout: { tablePositions },
  }
}

export function hasDesignerProjectionChanges(current: IDataSetMetadata, persisted: IDataSetMetadata | null): boolean {
  if (!persisted) {
    return Object.keys(current.tables).length > 0 || (current.tableRelations?.length ?? 0) > 0
  }

  return JSON.stringify(normalizeDesignerComparableMetadata(current)) !== JSON.stringify(normalizeDesignerComparableMetadata(persisted))
}

function normalizeDesignerComparableMetadata(metadata: IDataSetMetadata): IDataSetMetadata {
  const { pageId: _pageId, ...rest } = metadata
  const tableEntries = Object.entries(metadata.tables)
  const tablePositions = Object.fromEntries(
    tableEntries.map(([tableName], index) => [
      tableName,
      metadata.layout?.tablePositions?.[tableName] ?? getDefaultTablePosition(index),
    ]),
  )

  return {
    ...rest,
    tableRelations: metadata.tableRelations ?? [],
    ...(tableEntries.length > 0
      ? {
          layout: {
            ...(metadata.layout ?? {}),
            tablePositions,
          },
        }
      : {}),
  }
}
