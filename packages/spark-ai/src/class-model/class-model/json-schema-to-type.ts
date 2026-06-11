import type { AiJsonSchema } from '../../json'

type JsonRecord = Readonly<Record<string, unknown>>

export function jsonSchemaToTypeText(schema: AiJsonSchema | undefined): string {
  if (schema === undefined) return 'void'
  if (schema === true) return 'unknown'
  if (schema === false) return 'never'
  if (!isRecord(schema)) return 'unknown'

  const ref = schema['$ref']
  if (typeof ref === 'string') return refName(ref)

  const title = schema['title']
  if (typeof title === 'string' && title.length > 0) return title

  const enumValues = schema['enum']
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return enumValues.map(value => JSON.stringify(value)).join(' | ')
  }

  const anyOf = schema['anyOf']
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    return unique(anyOf.map(item => jsonSchemaToTypeText(readJsonSchema(item)))).join(' | ')
  }

  const oneOf = schema['oneOf']
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return unique(oneOf.map(item => jsonSchemaToTypeText(readJsonSchema(item)))).join(' | ')
  }

  const type = schema['type']
  if (Array.isArray(type)) return type.map(schemaTypeToText).join(' | ')
  if (typeof type === 'string') {
    if (type === 'array') {
      const items = schema['items']
      return `${jsonSchemaToTypeText(items)}[]`
    }
    if (type === 'object') return objectTypeText(schema)
    return schemaTypeToText(type)
  }

  if (isRecord(schema['properties'])) return objectTypeText(schema)
  return 'unknown'
}

export function schemaTypeToText(type: string): string {
  if (type === 'integer') return 'number'
  if (type === 'null') return 'null'
  return type
}

function objectTypeText(schema: JsonRecord): string {
  const properties = schema['properties']
  if (!isRecord(properties)) return 'Record<string, unknown>'
  const required = new Set(Array.isArray(schema['required']) ? schema['required'].filter(isString) : [])
  const parts = Object.entries(properties).map(([name, child]) => {
    const optional = required.has(name) ? '' : '?'
    return `${quotePropertyName(name)}${optional}: ${jsonSchemaToTypeText(readJsonSchema(child))}`
  })
  return parts.length === 0 ? 'Record<string, unknown>' : `{ ${parts.join('; ')} }`
}

function refName(ref: string): string {
  const value = ref.split('/').at(-1) ?? ref
  return value.replaceAll('~1', '/').replaceAll('~0', '~')
}

function quotePropertyName(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ? name : JSON.stringify(name)
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readJsonSchema(value: unknown): AiJsonSchema {
  if (value === true || value === false) return value
  if (isRecord(value)) return value
  return true
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
