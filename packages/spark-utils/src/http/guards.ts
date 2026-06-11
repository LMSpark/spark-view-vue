/**
 * @module @spark-appworks/spark-utils:http/guards
 * @spark-appworks/spark-utils 的 http/guards 模块。
 * 该 DTS shard 当前不导出 ClassModel symbol。
 */
import { isRecord } from '../internal/guards.js'
import type { RequestError } from './types.js'

export function isRequestError(value: unknown): value is RequestError {
  return value instanceof Error
    && value.name === 'RequestError'
    && isRecord(value)
    && isRecord(value['config'])
}
