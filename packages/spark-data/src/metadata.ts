import type { DataSetMetadata, TableMetadata, ViewMetadata } from './types'

interface TableMetadataLike extends Omit<TableMetadata, 'tableName'> {
  tableName?: string
}

function normalizeViewMetadata(
  view: ViewMetadata,
  tableName: string,
  viewId: string,
): ViewMetadata {
  const normalized: ViewMetadata = { ...view }
  normalized.tableName ??= tableName
  normalized.viewId ??= viewId
  return normalized
}

export function normalizeTableMetadata(
  input: TableMetadataLike,
  tableNameFromKey?: string,
): TableMetadata {
  const tableName = input.tableName ?? tableNameFromKey
  if (tableName === undefined || tableName.trim() === '') {
    throw new Error('TableMetadata.tableName 不能为空')
  }

  if (!Object.prototype.hasOwnProperty.call(input.views, 'default')) {
    throw new Error(`表 ${tableName} 缺少 views.default`)
  }

  const normalizedViews: TableMetadata['views'] = {
    default: normalizeViewMetadata(input.views.default, tableName, 'default'),
  }
  for (const [viewId, view] of Object.entries(input.views)) {
    if (viewId === 'default') continue
    normalizedViews[viewId] = normalizeViewMetadata(view, tableName, viewId)
  }

  return {
    tableName,
    columns: input.columns,
    ...(input.resourceType !== undefined ? { resourceType: input.resourceType } : {}),
    ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
    ...(input.businessCategory !== undefined ? { businessCategory: input.businessCategory } : {}),
    ...(input.api !== undefined ? { api: input.api } : {}),
    ...(input.crudConfig !== undefined ? { crudConfig: input.crudConfig } : {}),
    views: normalizedViews,
  }
}

export function normalizeDataSetMetadata(input: DataSetMetadata): DataSetMetadata {
  const normalizedTables: Record<string, TableMetadata> = {}

  for (const [tableName, rawTable] of Object.entries(input.tables)) {
    normalizedTables[tableName] = normalizeTableMetadata(rawTable, tableName)
  }

  const normalizedLayout = (() => {
    if (input.layout === undefined) return undefined
    const raw = input.layout.tablePositions
    if (raw === undefined) return {}

    const tablePositions: Record<string, { x: number; y: number }> = {}
    for (const [tableName, value] of Object.entries(raw)) {
      if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
        tablePositions[tableName] = { x: value.x, y: value.y }
      }
    }

    return { tablePositions }
  })()

  return {
    schemaVersion: input.schemaVersion ?? 2,
    dataSetName: input.dataSetName,
    tables: normalizedTables,
    ...(input.tableRelations !== undefined ? { tableRelations: input.tableRelations } : {}),
    ...(input.viewDependencies !== undefined ? { viewDependencies: input.viewDependencies } : {}),
    ...(input.version !== undefined ? { version: input.version } : {}),
    ...(input.pageId !== undefined ? { pageId: input.pageId } : {}),
    ...(input.saveChanges !== undefined ? { saveChanges: input.saveChanges } : {}),
    ...(normalizedLayout !== undefined ? { layout: normalizedLayout } : {}),
  }
}
