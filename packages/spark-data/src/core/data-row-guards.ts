/**
 * @module @spark-appworks/spark-data:core/data-row-guards
 * @spark-appworks/spark-data 的 core/data-row-guards 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import { isRecord } from '@spark-appworks/spark-utils'
import type { DataRow } from '../types'

export function isDataRow(value: unknown): value is DataRow {
  return isRecord(value)
}
