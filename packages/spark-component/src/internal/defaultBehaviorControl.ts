export interface DefaultBehaviorControl {
  cancel: boolean
}

export function createDefaultBehaviorControl(): DefaultBehaviorControl {
  return { cancel: false }
}

export function isDefaultBehaviorControl(value: unknown): value is DefaultBehaviorControl {
  return value !== null
    && value !== undefined
    && typeof value === 'object'
    && 'cancel' in value
    && typeof (value as Record<string, unknown>)['cancel'] === 'boolean'
}