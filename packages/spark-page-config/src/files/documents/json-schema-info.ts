import type {
  JsonPath,
  JsonPathSegment,
  JsonSchemaInfo,
} from './json-document'
import { isJsonObject } from './json-document'

type JsonSchemaRecord = Record<string, unknown>

/**
 * 根据路径从 JSON Schema 解析出该节点的标题、描述、是否必填、枚举值列表。
 */
export function resolveSchemaInfoForPath(
  schema: Record<string, unknown> | null | undefined,
  path: JsonPath,
): JsonSchemaInfo {
  if (!schema) return emptySchemaInfo()

  const defs = asSchemaRecord(schema['$defs'])
  const parentSchema = resolveSchemaNode(schema, path.slice(0, -1), defs)
  const schemaNode = resolveSchemaNode(schema, path, defs)
  const lastSegment = path[path.length - 1]
  const required = typeof lastSegment === 'string'
    ? listRequiredKeys(parentSchema).includes(lastSegment)
    : false

  return {
    title: readSchemaString(schemaNode, 'title'),
    description: readSchemaString(schemaNode, 'description'),
    required,
    enumValues: readSchemaEnum(schemaNode),
  }
}

function resolveSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  path: JsonPath,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  let current = normalizeSchemaNode(schemaNode, defs)
  for (const segment of path) {
    if (!current) return null
    current = selectChildSchema(current, segment, defs)
  }
  return current
}

function normalizeSchemaNode(
  schemaNode: JsonSchemaRecord | null | undefined,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  if (!schemaNode) return null

  const refValue = schemaNode['$ref']
  if (typeof refValue === 'string' && refValue.startsWith('#/$defs/') && defs) {
    const refKey = refValue.slice('#/$defs/'.length)
    const target = asSchemaRecord(defs[refKey])
    return normalizeSchemaNode(target ?? schemaNode, defs)
  }

  if (Array.isArray(schemaNode['oneOf'])) {
    return schemaNode
  }

  return schemaNode
}

function selectChildSchema(
  schemaNode: JsonSchemaRecord,
  segment: JsonPathSegment,
  defs: JsonSchemaRecord | null,
): JsonSchemaRecord | null {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) return null

  const oneOf = normalized['oneOf']
  if (Array.isArray(oneOf)) {
    const candidate = oneOf
      .map((entry) => normalizeSchemaNode(asSchemaRecord(entry), defs))
      .find((entry) => entry !== null && schemaCanAcceptSegment(entry, segment, defs))
    return candidate ?? null
  }

  if (typeof segment === 'number') {
    return normalizeSchemaNode(asSchemaRecord(normalized['items']), defs)
  }

  const properties = asSchemaRecord(normalized['properties'])
  if (properties?.[segment] !== undefined) {
    return normalizeSchemaNode(asSchemaRecord(properties[segment]), defs)
  }

  return normalizeSchemaNode(asSchemaRecord(normalized['additionalProperties']), defs)
}

function schemaCanAcceptSegment(
  schemaNode: JsonSchemaRecord,
  segment: JsonPathSegment,
  defs: JsonSchemaRecord | null,
): boolean {
  const normalized = normalizeSchemaNode(schemaNode, defs)
  if (!normalized) return false

  if (typeof segment === 'number') {
    return normalized['items'] !== undefined || normalized['type'] === 'array'
  }

  const properties = asSchemaRecord(normalized['properties'])
  return Boolean(
    normalized['type'] === 'object'
    || properties?.[segment] !== undefined
    || normalized['additionalProperties'] !== undefined,
  )
}

function listRequiredKeys(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['required'])) return []
  return schemaNode['required'].filter((entry): entry is string => typeof entry === 'string')
}

function readSchemaString(schemaNode: JsonSchemaRecord | null, key: 'title' | 'description'): string {
  const value = schemaNode?.[key]
  return typeof value === 'string' ? value : ''
}

function readSchemaEnum(schemaNode: JsonSchemaRecord | null): string[] {
  if (!schemaNode || !Array.isArray(schemaNode['enum'])) return []
  return schemaNode['enum'].filter((entry): entry is string => typeof entry === 'string')
}

function emptySchemaInfo(): JsonSchemaInfo {
  return { title: '', description: '', required: false, enumValues: [] }
}

function asSchemaRecord(value: unknown): JsonSchemaRecord | null {
  return isJsonObject(value) ? value : null
}
