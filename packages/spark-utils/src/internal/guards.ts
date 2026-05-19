export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

export function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function'
}

export function readStringProperty(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const property = value[key]
  return typeof property === 'string' ? property : undefined
}

export function readNumberProperty(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const property = value[key]
  return typeof property === 'number' ? property : undefined
}
