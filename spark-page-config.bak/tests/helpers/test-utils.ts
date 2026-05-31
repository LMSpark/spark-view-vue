import { isRecord } from '@spark-view/spark-utils'

export function getRecord(result: { readonly ok: boolean; readonly data?: unknown }): Record<string, unknown> {
  if (!result.ok || !isRecord(result.data)) {
    throw new Error('expected ok record result')
  }
  return result.data
}

export function getArray(result: { readonly ok: boolean; readonly data?: unknown }): unknown[] {
  if (!result.ok || !Array.isArray(result.data)) {
    throw new Error('expected ok array result')
  }
  return result.data
}
