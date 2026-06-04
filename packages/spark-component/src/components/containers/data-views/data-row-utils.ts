import { isDataRow, type DataRow } from '@spark-appworks/spark-data'

const TREE_LABEL_FALLBACK_FIELDS: readonly ['label', 'name', 'title'] = ['label', 'name', 'title']

export function isDataRecord(value: unknown): value is Record<string, unknown> {
  return isDataRow(value)
}

export function toDataRecord(value: unknown): Record<string, unknown> | null {
  return isDataRecord(value) ? value : null
}

export function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export function toMutableRows(rows: readonly DataRow[]): DataRow[] {
  return [...rows]
}

export function resolveTreeNodeText(
  record: Record<string, unknown>,
  preferredField: string,
  fallback: string,
): string {
  const preferred = readStringField(record, preferredField)
  if (preferred) return preferred
  for (const field of TREE_LABEL_FALLBACK_FIELDS) {
    const value = readStringField(record, field)
    if (value) return value
  }
  return fallback
}
