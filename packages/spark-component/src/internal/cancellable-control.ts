export interface CancellableControl {
  cancel: boolean
}

export function createCancellableControl(): CancellableControl {
  return { cancel: false }
}

export function isCancellableControl(value: unknown): value is CancellableControl {
  return value !== null
    && value !== undefined
    && typeof value === 'object'
    && 'cancel' in value
    && typeof (value as Record<string, unknown>)['cancel'] === 'boolean'
}