/**
 * CrudResult 类型守卫与工具函数。
 *
 * builtin-actions.ts 和 page/actions/action-executor.ts 共享。
 */
import type { CrudResult, IDataRow } from '@spark-view/spark-data'

export function isCrudResult<T>(value: unknown): value is CrudResult<T> {
  return value !== null
    && typeof value === 'object'
    && 'success' in value
    && typeof (value as { success?: unknown }).success === 'boolean'
}

export function isCrudSuccess<T>(value: boolean | IDataRow | CrudResult<T>): boolean {
  return isCrudResult(value) ? value.success : value !== false
}

export function getCrudErrorMessage<T>(value: CrudResult<T>, fallback: string): string {
  return value.message ?? value.error?.message ?? fallback
}
