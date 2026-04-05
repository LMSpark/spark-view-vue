import type { IDataSetMetadata, ITableMetadata, IViewMetadata } from './types'

type TableMetadataLike = Omit<ITableMetadata, 'tableName'> & { tableName?: string }

function normalizeViewMetadata(
  view: IViewMetadata,
  tableName: string,
  viewId: string,
): IViewMetadata {
  const normalized: IViewMetadata = { ...view }
  normalized.tableName ??= tableName
  normalized.viewId ??= viewId
  return normalized
}

export function normalizeTableMetadata(
  input: TableMetadataLike,
  tableNameFromKey?: string,
): ITableMetadata {
  const tableName = input.tableName ?? tableNameFromKey
  if (tableName === undefined || tableName.trim() === '') {
    throw new Error('ITableMetadata.tableName 不能为空')
  }

  if (!Object.prototype.hasOwnProperty.call(input.views, 'default')) {
    throw new Error(`表 ${tableName} 缺少 views.default`)
  }

  const normalizedViews = Object.fromEntries(
    Object.entries(input.views).map(([viewId, view]) => [viewId, normalizeViewMetadata(view, tableName, viewId)]),
  ) as { default: IViewMetadata } & Record<string, IViewMetadata>

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

export function normalizeDataSetMetadata(input: IDataSetMetadata): IDataSetMetadata {
  const normalizedTables: Record<string, ITableMetadata> = {}

  for (const [tableName, rawTable] of Object.entries(input.tables)) {
    normalizedTables[tableName] = normalizeTableMetadata(rawTable, tableName)
  }

  return {
    schemaVersion: input.schemaVersion ?? 2,
    dataSetName: input.dataSetName,
    tables: normalizedTables,
    ...(input.tableRelations !== undefined ? { tableRelations: input.tableRelations } : {}),
    ...(input.viewDependencies !== undefined ? { viewDependencies: input.viewDependencies } : {}),
    ...(input.version !== undefined ? { version: input.version } : {}),
    ...(input.pageId !== undefined ? { pageId: input.pageId } : {}),
  }
}