import type { IDataRow } from '@spark-view/spark-data'

export function syncReactiveRow(
  target: IDataRow,
  source: IDataRow | null | undefined,
): void {
  const incoming = source ?? {}
  const incomingKeys = new Set(Object.keys(incoming))

  for (const key of Object.keys(target)) {
    if (!incomingKeys.has(key)) {
      target[key] = undefined
    }
  }

  for (const key of incomingKeys) {
    if (target[key] !== incoming[key]) {
      target[key] = incoming[key]
    }
  }
}
