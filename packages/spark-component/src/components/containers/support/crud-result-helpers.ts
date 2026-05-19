/**
 * CrudResult 类型守卫与工具函数。
 *
 * builtin-action-handler.ts 和 page/actions/action-executor.ts 共享。
 */
import type { CrudResult, DataRow } from '@spark-view/spark-data'

/** 运行时 CrudResult 形状检测用中间类型（仅供 isCrudResult 内部收窄使用） */
interface CrudResultShape {
  success: unknown
}

export function isCrudResult<T>(value: unknown): value is CrudResult<T> {
  return value !== null
    && typeof value === 'object'
    && 'success' in value
    && typeof (value as CrudResultShape).success === 'boolean'
}

export function isCrudSuccess<T>(value: boolean | DataRow | CrudResult<T>): boolean {
  return isCrudResult(value) ? value.success : value !== false
}

export function getCrudErrorMessage<T>(value: CrudResult<T>, fallback: string): string {
  return value.message ?? value.error?.message ?? fallback
}
