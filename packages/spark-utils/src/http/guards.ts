import { isRecord } from '../internal/guards.js'
import type { RequestError } from './types.js'

export function isRequestError(value: unknown): value is RequestError {
  return value instanceof Error
    && value.name === 'RequestError'
    && isRecord(value)
    && isRecord(value['config'])
}
