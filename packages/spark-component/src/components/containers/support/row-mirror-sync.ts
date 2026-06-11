/**
 * @module @spark-appworks/spark-component:components/containers/support/row-mirror-sync
 * @spark-appworks/spark-component 的 components/containers/support/row-mirror-sync 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import type { DataRow } from '@spark-appworks/spark-data'

export function syncReactiveRow(
  target: DataRow,
  source: DataRow | null | undefined,
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
