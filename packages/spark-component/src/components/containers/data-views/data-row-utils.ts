import type { DataRow } from '@spark-view/spark-data'

const TREE_LABEL_FALLBACK_FIELDS = ['label', 'name', 'title'] as const

export function toDataRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export function toMutableRows(rows: readonly DataRow[]): DataRow[] {
  return rows as DataRow[]
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
