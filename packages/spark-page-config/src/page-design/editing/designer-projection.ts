import type { DataColumn, DataSetMetadata, TableMetadata, TableRelation } from '@spark-view/spark-data'

export interface DesignerColumnProjection extends DataColumn {
  id: string
}

export interface DesignerTableProjection extends Omit<TableMetadata, 'columns'> {
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
  metadata: DataSetMetadata,
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
  metadata: DataSetMetadata,
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

export function projectDesignerRelations(metadata: DataSetMetadata): DesignerRelationProjection[] {
  return (metadata.tableRelations ?? []).map((rel) => ({
    ...rel,
    relationType: 'one-to-many',
  }))
}

export function buildDataSetMetadataFromDesignerProjection(params: {
  dataSetName: string
  tables: readonly DesignerTableProjection[]
  relations: readonly DesignerRelationProjection[]
  viewDependencies?: NonNullable<DataSetMetadata['viewDependencies']>
}): DataSetMetadata {
  const tablesObj: Record<string, TableMetadata> = {}
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

export function hasDesignerProjectionChanges(current: DataSetMetadata, persisted: DataSetMetadata | null): boolean {
  if (!persisted) {
    return Object.keys(current.tables).length > 0 || (current.tableRelations?.length ?? 0) > 0
  }

  if (current === persisted) return false

  return !isEqualComparableMetadata(
    normalizeDesignerComparableMetadata(current),
    normalizeDesignerComparableMetadata(persisted),
  )
}

function isEqualComparableMetadata(a: DataSetMetadata, b: DataSetMetadata): boolean {
  if (a.dataSetName !== b.dataSetName) return false

  const aTableKeys = Object.keys(a.tables)
  const bTableKeys = Object.keys(b.tables)
  if (aTableKeys.length !== bTableKeys.length) return false
  for (const key of aTableKeys) {
    const at = a.tables[key]
    const bt = b.tables[key]
    if (!at || !bt) return false
    if (!isEqualTableMetadata(at, bt)) return false
  }

  const aRels = a.tableRelations ?? []
  const bRels = b.tableRelations ?? []
  if (aRels.length !== bRels.length) return false
  for (let i = 0; i < aRels.length; i++) {
    const ar = aRels[i]
    const br = bRels[i]
    if (!ar || !br) return false
    if (!isEqualRelation(ar, br)) return false
  }

  if (!isEqualViewDeps(a.viewDependencies, b.viewDependencies)) return false

  const aPos = a.layout?.tablePositions
  const bPos = b.layout?.tablePositions
  if (aPos && bPos) {
    const aKeys = Object.keys(aPos)
    const bKeys = Object.keys(bPos)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      const ap = aPos[key]
      const bp = bPos[key]
      if (ap?.x !== bp?.x || ap?.y !== bp?.y) return false
    }
  } else if (aPos !== bPos) {
    return false
  }

  return true
}

function isEqualTableMetadata(a: TableMetadata, b: TableMetadata): boolean {
  if (a.tableName !== b.tableName) return false
  if (a.resourceType !== b.resourceType) return false
  if (a.resourceId !== b.resourceId) return false
  if (a.businessCategory !== b.businessCategory) return false

  const aCols = a.columns
  const bCols = b.columns
  if (aCols.length !== bCols.length) return false
  for (let i = 0; i < aCols.length; i++) {
    const ac = aCols[i]
    const bc = bCols[i]
    if (!ac || !bc) return false
    if (!isEqualColumn(ac, bc)) return false
  }

  if (!isEqualObject(a.api, b.api)) return false
  if (!isEqualObject(a.views, b.views)) return false

  return true
}

function isEqualColumn(a: DataColumn, b: DataColumn): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.label === b.label &&
    a.allowDBNull === b.allowDBNull &&
    a.isPrimaryKey === b.isPrimaryKey &&
    isEqualObject(a.defaultValue, b.defaultValue)
  )
}

function isEqualRelation(a: TableRelation, b: TableRelation): boolean {
  return (
    a.parentTable === b.parentTable &&
    a.childTable === b.childTable &&
    a.parentField === b.parentField &&
    a.childField === b.childField &&
    a.relationName === b.relationName &&
    a.condition === b.condition &&
    a.cascadeUpdate === b.cascadeUpdate &&
    a.cascadeDelete === b.cascadeDelete
  )
}

function isEqualViewDeps(
  a: DataSetMetadata['viewDependencies'],
  b: DataSetMetadata['viewDependencies'],
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return isEqualArray(a as unknown[], b as unknown[])
}

function getObjectEntries(value: object): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = []
  for (const key of Object.keys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key)
    if (desc) entries.push([key, desc.value])
  }
  return entries
}

function isEqualObject(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) return isEqualArray(a, b)
  const aEntries = getObjectEntries(a)
  const bEntries = getObjectEntries(b)
  if (aEntries.length !== bEntries.length) return false
  const bMap = new Map(bEntries)
  for (const [key, aVal] of aEntries) {
    if (!bMap.has(key) || !isEqualObject(aVal, bMap.get(key))) return false
  }
  return true
}

function isEqualArray(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!isEqualObject(a[i], b[i])) return false
  }
  return true
}

function normalizeDesignerComparableMetadata(metadata: DataSetMetadata): DataSetMetadata {
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
