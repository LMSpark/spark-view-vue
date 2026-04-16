import type { IDataRow } from '@spark-view/spark-data'

export interface RowSelectionSource {
  currentRow?: IDataRow | null | undefined
  selectedRows?: readonly IDataRow[] | null | undefined
}

export function resolveCurrentRowPath(
  contextRow: IDataRow | null | undefined,
  dataSource: RowSelectionSource | null | undefined,
): IDataRow | null {
  if (contextRow !== null && contextRow !== undefined) {
    return contextRow
  }
  return dataSource?.currentRow ?? null
}

export function resolveSelectedRowsPath(
  dataSource: RowSelectionSource | null | undefined,
): IDataRow[] {
  const selectedRows = dataSource?.selectedRows
  return selectedRows === undefined || selectedRows === null ? [] : selectedRows.slice()
}
