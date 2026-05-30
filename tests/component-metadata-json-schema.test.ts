import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { AiJsonSchemaValidator, type AiJsonSchemaObject, type AiJsonValue } from '@spark-view/spark-ai/json'
import { isRecord } from '@spark-view/spark-utils'
import { createPageDesignPayloadRegistry } from '../packages/spark-page-config/src/page-model/ai/payload-catalog-tool-catalog'

const STANDARD_JSON_SCHEMA_KEYWORDS = new Set([
  '$id',
  '$schema',
  '$ref',
  '$defs',
  '$anchor',
  '$dynamicRef',
  '$dynamicAnchor',
  '$vocabulary',
  '$comment',
  'type',
  'enum',
  'const',
  'multipleOf',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'items',
  'prefixItems',
  'contains',
  'maxItems',
  'minItems',
  'uniqueItems',
  'maxContains',
  'minContains',
  'properties',
  'patternProperties',
  'additionalProperties',
  'propertyNames',
  'required',
  'dependentRequired',
  'dependentSchemas',
  'unevaluatedItems',
  'unevaluatedProperties',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'format',
  'contentEncoding',
  'contentMediaType',
  'contentSchema',
  'title',
  'description',
  'default',
  'deprecated',
  'readOnly',
  'writeOnly',
  'examples',
])

const STANDARD_JSON_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const DRAFT_2020_12_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

type JsonRecord = Record<string, unknown>
type SchemaLocation = Readonly<{
  path: string
  schema: unknown
}>

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'))
}


function recordEntries(value: unknown): Array<[string, unknown]> {
  return isRecord(value) ? Object.entries(value) : []
}

function collectComponentCatalogSchemas(catalog: unknown): SchemaLocation[] {
  const out: SchemaLocation[] = []
  if (!isRecord(catalog)) return out

  for (const [key, schema] of recordEntries(catalog['$defs'])) {
    out.push({ path: `$defs.${key}`, schema })
  }

  for (const [componentKey, rawEntry] of recordEntries(catalog['components'])) {
    if (!isRecord(rawEntry)) continue
    const props = rawEntry['props']
    if (Array.isArray(props)) {
      for (const prop of props) {
        if (!isRecord(prop) || prop['schema'] === undefined) continue
        out.push({ path: `components.${componentKey}.props.${String(prop['name'])}.schema`, schema: prop['schema'] })
      }
    }
    const emits = rawEntry['emits']
    if (Array.isArray(emits)) {
      for (const emit of emits) {
        if (!isRecord(emit) || emit['schema'] === undefined) continue
        out.push({ path: `components.${componentKey}.emits.${String(emit['name'])}.schema`, schema: emit['schema'] })
      }
    }
  }

  return out
}

function validateCatalogEnvelope(label: string, catalog: unknown): string[] {
  const issues: string[] = []
  if (!isRecord(catalog)) return [`${label}: catalog root must be object`]
  if (catalog['$schema'] !== DRAFT_2020_12_SCHEMA) {
    issues.push(`${label}: $schema must be ${DRAFT_2020_12_SCHEMA}`)
  }
  const components = catalog['components']
  if (!isRecord(components)) {
    issues.push(`${label}: components must be object`)
  } else if (catalog['componentCount'] !== Object.keys(components).length) {
    issues.push(`${label}: componentCount does not match components size`)
  }
  for (const [key, schema] of recordEntries(catalog['$defs'])) {
    if (isRecord(schema) && schema['title'] !== key) {
      issues.push(`${label}: $defs.${key}.title must equal ${key}`)
    }
  }
  return issues
}

function validateStandardSchemaNode(
  label: string,
  schema: unknown,
  defs: JsonRecord,
  issues: string[],
): void {
  walkSchemaNode(label, schema, defs, issues)

  if (schema === true || schema === false || isRecord(schema)) {
    const wrapper: AiJsonSchemaObject = {
      type: 'object',
      properties: {
        value: schema,
      },
      $defs: defs,
    }
    expect(() => AiJsonSchemaValidator.validateDeserializedParams({}, wrapper), label).not.toThrow()
  }
}

function walkSchemaNode(label: string, schema: unknown, defs: JsonRecord, issues: string[]): void {
  if (schema === true || schema === false) return
  if (!isRecord(schema)) {
    issues.push(`${label}: schema node must be object or boolean`)
    return
  }

  for (const key of Object.keys(schema)) {
    if (!STANDARD_JSON_SCHEMA_KEYWORDS.has(key)) {
      issues.push(`${label}.${key}: non-standard JSON Schema keyword`)
    }
  }

  const type = schema['type']
  if (type !== undefined) {
    const types = Array.isArray(type) ? type : [type]
    for (const item of types) {
      if (!STANDARD_JSON_TYPES.has(String(item))) {
        issues.push(`${label}.type: invalid JSON Schema type ${JSON.stringify(type)}`)
      }
    }
  }

  const ref = schema['$ref']
  if (typeof ref === 'string') {
    if (!ref.startsWith('#/$defs/')) {
      issues.push(`${label}.$ref: only local #/$defs references are allowed`)
    } else {
      const defKey = decodeURIComponent(ref.slice('#/$defs/'.length))
      if (defs[defKey] === undefined) {
        issues.push(`${label}.$ref: missing $defs entry ${defKey}`)
      }
    }
  }

  for (const [key, child] of recordEntries(schema['properties'])) {
    walkSchemaNode(`${label}.properties.${key}`, child, defs, issues)
  }
  for (const [key, child] of recordEntries(schema['patternProperties'])) {
    walkSchemaNode(`${label}.patternProperties.${key}`, child, defs, issues)
  }
  for (const [key, child] of recordEntries(schema['$defs'])) {
    walkSchemaNode(`${label}.$defs.${key}`, child, defs, issues)
  }
  for (const keyword of ['dependentSchemas'] as const) {
    for (const [key, child] of recordEntries(schema[keyword])) {
      walkSchemaNode(`${label}.${keyword}.${key}`, child, defs, issues)
    }
  }

  walkSchemaChild(label, 'items', schema['items'], defs, issues)
  walkSchemaChild(label, 'additionalProperties', schema['additionalProperties'], defs, issues)
  walkSchemaChild(label, 'unevaluatedProperties', schema['unevaluatedProperties'], defs, issues)
  walkSchemaChild(label, 'unevaluatedItems', schema['unevaluatedItems'], defs, issues)
  walkSchemaChild(label, 'propertyNames', schema['propertyNames'], defs, issues)
  walkSchemaChild(label, 'contains', schema['contains'], defs, issues)
  walkSchemaChild(label, 'not', schema['not'], defs, issues)
  walkSchemaChild(label, 'if', schema['if'], defs, issues)
  walkSchemaChild(label, 'then', schema['then'], defs, issues)
  walkSchemaChild(label, 'else', schema['else'], defs, issues)
  walkSchemaChild(label, 'contentSchema', schema['contentSchema'], defs, issues)

  for (const keyword of ['prefixItems', 'allOf', 'anyOf', 'oneOf'] as const) {
    const children = schema[keyword]
    if (!Array.isArray(children)) continue
    children.forEach((child, index) => {
      walkSchemaNode(`${label}.${keyword}[${String(index)}]`, child, defs, issues)
    })
  }
}

function walkSchemaChild(
  label: string,
  keyword: string,
  value: unknown,
  defs: JsonRecord,
  issues: string[],
): void {
  if (value === undefined) return
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      walkSchemaNode(`${label}.${keyword}[${String(index)}]`, child, defs, issues)
    })
    return
  }
  walkSchemaNode(`${label}.${keyword}`, value, defs, issues)
}

function expectStandardComponentCatalog(label: string, catalog: unknown): void {
  const issues = validateCatalogEnvelope(label, catalog)
  const defs = isRecord(catalog) && isRecord(catalog['$defs']) ? catalog['$defs'] : {}
  for (const location of collectComponentCatalogSchemas(catalog)) {
    validateStandardSchemaNode(`${label}.${location.path}`, location.schema, defs, issues)
  }
  expect(issues).toEqual([])
}

function getRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be object`)
  return value
}

async function guidePayloadParamsSchema(key: string): Promise<JsonRecord> {
  const provider = createPageDesignPayloadRegistry().requireProvider('node-tree', 'spark.component')
  const payload = provider.guidePayload(key)
  expect(payload).not.toBeNull()
  return getRecord(payload?.paramsSchema, 'guidePayload.paramsSchema')
}

async function queryPayloads(args: Record<string, AiJsonValue>): Promise<JsonRecord> {
  const provider = createPageDesignPayloadRegistry().requireProvider('node-tree', 'spark.component')
  const items = provider.queryPayloads(args)
  return {
    moduleKind: 'node-tree',
    payloadRef: 'spark.component',
    total: items.length,
    items,
  }
}

describe('Vue component metadata JSON Schema', () => {
  it('keeps generated component catalog schemas standard JSON Schema 2020-12', () => {
    const catalog = readJsonFile(resolve(process.cwd(), 'packages/spark-page-config/src/page-model/ai/payloads/component-catalog.json'))

    expectStandardComponentCatalog('component-catalog', catalog)
  })

  it('keeps backend-persisted component metadata in sync and standard JSON Schema 2020-12', () => {
    const catalog = readJsonFile(resolve(process.cwd(), 'packages/spark-page-config/src/page-model/ai/payloads/component-catalog.json'))
    const backendMetadata = readJsonFile(resolve(process.cwd(), 'spark-ai-server/data/component-metadata.json'))

    expectStandardComponentCatalog('component-metadata', backendMetadata)
    expect(getRecord(backendMetadata, 'component-metadata')['componentCount']).toBe(getRecord(catalog, 'component-catalog')['componentCount'])
    expect(Object.keys(getRecord(getRecord(backendMetadata, 'component-metadata')['components'], 'component-metadata.components'))).toEqual(
      Object.keys(getRecord(getRecord(catalog, 'component-catalog')['components'], 'component-catalog.components')),
    )
  })

  it('projects guidePayload paramsSchema as standard JSON Schema object root', async () => {
    const paramsSchema = await guidePayloadParamsSchema('r-button')
    const issues: string[] = []

    expect(paramsSchema['type']).toBe('object')
    const defs = isRecord(paramsSchema['$defs']) ? paramsSchema['$defs'] : {}
    validateStandardSchemaNode('guidePayload.r-button.paramsSchema', paramsSchema, defs, issues)
    expect(issues).toEqual([])
  })

  it('projects guidePayload paramsSchema with recursively complete local $defs', async () => {
    const paramsSchema = await guidePayloadParamsSchema('r-table')
    const defs = getRecord(paramsSchema['$defs'], 'guidePayload.r-table.paramsSchema.$defs')
    const issues: string[] = []

    expect(defs).toHaveProperty('r-toolbar')
    expect(defs).toHaveProperty('r-filter')
    expect(defs).toHaveProperty('r-tail')
    expect(defs).toHaveProperty('SparkNode')
    validateStandardSchemaNode('guidePayload.r-table.paramsSchema', paramsSchema, defs, issues)
    expect(issues).toEqual([])
  })

  it('projects queryPayloads directory entries with usable summaries before guide lookup', async () => {
    const directory = await queryPayloads({ key: 'r-table', limit: 1 })
    const items = directory['items']
    if (!Array.isArray(items) || items.length !== 1) throw new Error('queryPayloads should return one r-table item')
    const item = getRecord(items[0], 'queryPayloads.items[0]')

    expect(directory['total']).toBe(1)
    expect(directory).toMatchObject({
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
    })
    expect(item).toMatchObject({
      moduleKind: 'node-tree',
      payloadRef: 'spark.component',
      key: 'r-table',
      type: 'r-table',
      category: 'container',
      configurable: true,
      internal: false,
    })
    expect(typeof item['description']).toBe('string')
    expect(String(item['description']).length).toBeGreaterThan(20)
    expect(typeof item['filePath']).toBe('string')
    expect(typeof item['propCount']).toBe('number')
    expect(item['propCount']).toBeGreaterThan(0)
  })
})
