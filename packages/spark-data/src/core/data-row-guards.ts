import { isRecord } from '@spark-appworks/spark-utils'
import type { DataRow } from '../types'

export function isDataRow(value: unknown): value is DataRow {
  return isRecord(value)
}
