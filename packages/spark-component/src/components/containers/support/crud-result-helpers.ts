/**
 * CrudResult 类型守卫与工具函数。
 *
 * builtin-action-handler.ts 和 page/actions/action-executor.ts 共享。
 */
import type { CrudResult, DataRow } from '@spark-view/spark-data'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isCrudResult<T>(value: unknown): value is CrudResult<T> {
  return isRecord(value)
    && 'success' in value
    && typeof value['success'] === 'boolean'
}

export function isCrudSuccess<T>(value: boolean | DataRow | CrudResult<T>): boolean {
  return isCrudResult(value) ? value.success : value !== false
}

export function getCrudErrorMessage<T>(value: CrudResult<T>, fallback: string): string {
  return value.message ?? value.error?.message ?? fallback
}
