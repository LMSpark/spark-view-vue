import { isRecord } from '@spark-view/spark-utils'
import type { DataRow } from '../types'

export function isDataRow(value: unknown): value is DataRow {
  return isRecord(value)
}
