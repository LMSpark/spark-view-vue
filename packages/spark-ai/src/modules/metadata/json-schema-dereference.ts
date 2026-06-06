/**
 * Resolve JSON Schema $ref against document-level $defs.
 *
 * 仅用于 inlineSchemaRefs 或测试；生产校验应使用 JsonSchemaValidator + schemaDefs（AJV 2020）。
 */

import type { AiModuleMetadataJson } from './ai-api-object-metadata-schema'

type JsonSchemaValue = boolean | JsonSchemaObject

type JsonSchemaObject = Readonly<{
  readonly [keyword: string]: unknown
  readonly $ref?: string
  readonly type?: string | readonly string[]
  readonly properties?: Readonly<Record<string, JsonSchemaValue>>
  readonly required?: readonly string[]
  readonly items?: JsonSchemaValue
  readonly anyOf?: readonly JsonSchemaValue[]
  readonly oneOf?: readonly JsonSchemaValue[]
  readonly allOf?: readonly JsonSchemaValue[]
  readonly prefixItems?: readonly JsonSchemaValue[]
  readonly additionalProperties?: JsonSchemaValue
  readonly enum?: readonly unknown[]
}>

export function dereferenceJsonSchema(
  schema: JsonSchemaValue,
  defs: Readonly<Record<string, JsonSchemaObject>> | undefined,
  resolving: Set<string> = new Set(),
): JsonSchemaValue {
  if (typeof schema === 'boolean' || defs === undefined) return schema
  if (typeof schema.$ref === 'string' && schema.$ref.startsWith('#/$defs/')) {
    const name = schema.$ref.slice('#/$defs/'.length)
    if (resolving.has(name)) return schema
    const target = defs[name]
    if (target === undefined) return schema
    resolving.add(name)
    try {
      return dereferenceJsonSchema(target, defs, resolving)
    } finally {
      resolving.delete(name)
    }
  }

  const output: Record<string, unknown> = { ...schema }
  const properties = output['properties']
  if (isPlainObject(properties)) {
    output['properties'] = Object.fromEntries(
      Object.entries(properties).map(([name, property]) => [
        name,
        isJsonSchemaValue(property)
          ? dereferenceJsonSchema(property, defs, new Set(resolving))
          : property,
      ]),
    )
  }
  const items = output['items']
  if (isJsonSchemaValue(items)) {
    output['items'] = dereferenceJsonSchema(items, defs, new Set(resolving))
  }
  const additionalProperties = output['additionalProperties']
  if (isJsonSchemaValue(additionalProperties)) {
    output['additionalProperties'] = dereferenceJsonSchema(
      additionalProperties,
      defs,
      new Set(resolving),
    )
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    const keywordItems = output[keyword]
    if (Array.isArray(keywordItems)) {
      output[keyword] = keywordItems
        .filter(isJsonSchemaValue)
        .map(item => dereferenceJsonSchema(item, defs, new Set(resolving)))
    }
  }
  return output
}

export function dereferenceModuleMetadataSchemas(
  module: AiModuleMetadataJson,
  defs: Readonly<Record<string, JsonSchemaObject>> | undefined,
): AiModuleMetadataJson {
  if (defs === undefined || Object.keys(defs).length === 0) return module
  const visited = visitMetadataNode(module, defs)
  if (!isAiModuleMetadataJson(visited)) {
    throw new Error('dereferenceModuleMetadataSchemas produced invalid module metadata.')
  }
  return visited
}

function visitMetadataNode(value: unknown, defs: Readonly<Record<string, JsonSchemaObject>>): unknown {
  if (Array.isArray(value)) {
    return value.map(item => visitMetadataNode(item, defs))
  }
  if (!isPlainObject(value)) return value

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'paramsSchema' || key === 'resultSchema' || key === 'schema') {
      output[key] = isJsonSchemaValue(child)
        ? dereferenceJsonSchema(child, defs)
        : child
      continue
    }
    output[key] = visitMetadataNode(child, defs)
  }
  return output
}

function isAiModuleMetadataJson(value: unknown): value is AiModuleMetadataJson {
  if (!isPlainObject(value)) return false
  const schemaVersion = value['schemaVersion']
  if (schemaVersion !== 1 && schemaVersion !== 2) return false
  return isPlainObject(value['rootApi'])
}

function isJsonSchemaValue(value: unknown): value is JsonSchemaValue {
  return typeof value === 'boolean' || isPlainObject(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
