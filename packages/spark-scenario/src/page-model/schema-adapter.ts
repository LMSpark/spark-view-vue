import type { JsonSchema, JsonSchemaProperty } from '../contracts/json-schema'

const UNKNOWN_JSON_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'null'] as const

function stringifySchemaDescription(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function inferStringProperty(value: string): { property: JsonSchemaProperty; required: boolean } {
  const dashIndex = value.indexOf('—')
  const typePart = dashIndex > 0 ? value.slice(0, dashIndex).trim() : value.trim()
  const description = dashIndex > 0 ? value.slice(dashIndex + 1).trim() : value
  const optional = typePart.endsWith('?') || typePart.includes('undefined')
  const cleanTypePart = typePart.endsWith('?') ? typePart.slice(0, -1).trim() : typePart
  const types = cleanTypePart
    .split('|')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '' && part !== 'undefined')

  const jsonTypes: string[] = []
  for (const type of types) {
    if (type === 'string' || /^".*"$/u.test(type) || /^'.*'$/u.test(type)) {
      jsonTypes.push('string')
      continue
    }
    if (type === 'number' || type === 'integer') {
      jsonTypes.push('number')
      continue
    }
    if (type === 'boolean') {
      jsonTypes.push('boolean')
      continue
    }
    if (type === 'null') {
      jsonTypes.push('null')
      continue
    }
    if (type.endsWith('[]') || type.startsWith('array<')) {
      jsonTypes.push('array')
      continue
    }
    jsonTypes.push('object')
  }

  const uniqueTypes = Array.from(new Set(jsonTypes.length > 0 ? jsonTypes : UNKNOWN_JSON_TYPES))
  const singleType = uniqueTypes[0]
  const property: JsonSchemaProperty = {
    type: uniqueTypes.length === 1 && singleType !== undefined ? singleType : uniqueTypes,
    description,
  }
  if (uniqueTypes.includes('array')) {
    property.items = { type: 'object' }
  }
  return { property, required: !optional }
}

function inferProperty(value: unknown): { property: JsonSchemaProperty; required: boolean } {
  if (typeof value === 'string') {
    return inferStringProperty(value)
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { property: { type: UNKNOWN_JSON_TYPES.slice(), description: stringifySchemaDescription(value) }, required: true }
  }

  const record = value as Record<string, unknown>
  const kind = typeof record['kind'] === 'string' ? record['kind'] : undefined
  const note = typeof record['note'] === 'string' ? record['note'] : undefined
  const description = note ?? stringifySchemaDescription(value)
  const required = record['optional'] === true ? false : true

  if (kind === 'array') {
    const item = inferProperty(record['items'])
    return {
      property: {
        type: 'array',
        description,
        items: item.property,
      },
      required,
    }
  }

  if (kind === 'object') {
    const rawProperties = record['properties']
    const rawOptional = record['optional']
    const properties: Record<string, JsonSchemaProperty> = {}
    if (typeof rawProperties === 'object' && rawProperties !== null && !Array.isArray(rawProperties)) {
      for (const [key, child] of Object.entries(rawProperties)) {
        properties[key] = inferProperty(child).property
      }
    }
    if (typeof rawOptional === 'object' && rawOptional !== null && !Array.isArray(rawOptional)) {
      for (const [key, child] of Object.entries(rawOptional)) {
        properties[key] = inferProperty(child).property
      }
    }
    const rawRequired = record['required']
    const requiredFields = Array.isArray(rawRequired)
      ? rawRequired.filter((item): item is string => typeof item === 'string')
      : []
    return {
      property: {
        type: 'object',
        description,
        properties,
        ...(requiredFields.length > 0 ? { required: requiredFields } : {}),
      },
      required,
    }
  }

  if (kind === 'enum') {
    const rawEnum = record['enum']
    const enumValues = Array.isArray(rawEnum)
      ? rawEnum.filter((item): item is string | number | null => typeof item === 'string' || typeof item === 'number' || item === null)
      : []
    return {
      property: {
        type: ['string', 'number', 'null'],
        description,
        ...(enumValues.length > 0 ? { enum: enumValues } : {}),
      },
      required,
    }
  }

  return { property: { type: UNKNOWN_JSON_TYPES.slice(), description }, required }
}

export function legacyParamsToJsonSchema(paramsSchema: Record<string, unknown>): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(paramsSchema)) {
    if (key === 'kind' || key === 'note') continue
    if (key === 'required' && Array.isArray(value)) {
      required.push(...value.filter((item): item is string => typeof item === 'string'))
      continue
    }
    if (key === 'properties' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        const inferred = inferProperty(childValue)
        properties[childKey] = inferred.property
        if (inferred.required) required.push(childKey)
      }
      continue
    }
    if (key === 'optional' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        properties[childKey] = inferProperty(childValue).property
      }
      continue
    }
    const inferred = inferProperty(value)
    properties[key] = inferred.property
    if (inferred.required) required.push(key)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}
