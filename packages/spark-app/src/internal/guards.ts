export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  return Object.getOwnPropertyDescriptor(value, key)?.value
}

export function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readProperty(value, key)
  return typeof property === 'string' ? property : undefined
}

export function readNumberProperty(value: unknown, key: string): number | undefined {
  const property = readProperty(value, key)
  return typeof property === 'number' ? property : undefined
}

export function readBooleanProperty(value: unknown, key: string): boolean | undefined {
  const property = readProperty(value, key)
  return typeof property === 'boolean' ? property : undefined
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function readStringArrayProperty(value: unknown, key: string): string[] | undefined {
  const property = readProperty(value, key)
  return isStringArray(property) ? property : undefined
}
