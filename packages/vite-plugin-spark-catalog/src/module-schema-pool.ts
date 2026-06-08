/**
 * Pool and deduplicate JSON Schema fragments in module metadata.
 *
 * Draft 2020-12: primitive/enum/const schemas stay inline; only complex named types
 * and array wrappers pool to #/$defs/*.
 */

import { createHash } from 'node:crypto'
import { extractJsonSchemaLocalDefs, standardizeJsonSchema } from '@spark-appworks/spark-json-document'
import { jsonSchemaDefinitionName } from './json-schema-pool'

export const MODULE_METADATA_JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

const SCHEMA_SLOT_KEYS = new Set(['paramsSchema', 'resultSchema', 'schema'])

type JsonSchemaValue = boolean | JsonSchemaObject

type JsonSchemaObject = {
  [keyword: string]: unknown
  $ref?: string
  $defs?: Record<string, JsonSchemaValue>
  type?: string | string[]
  properties?: Record<string, JsonSchemaValue>
  required?: string[]
  items?: JsonSchemaValue
  anyOf?: JsonSchemaValue[]
  oneOf?: JsonSchemaValue[]
  allOf?: JsonSchemaValue[]
  prefixItems?: JsonSchemaValue[]
  additionalProperties?: JsonSchemaValue
  enum?: unknown[]
  const?: unknown
  title?: string
  description?: string
}

export type ModuleMetadataSchemaPoolResult<TModule> = Readonly<{
  module: TModule
  defs: Readonly<Record<string, JsonSchemaObject>>
}>

export type ModuleMetadataRuntimeDocument<TModule> = Readonly<{
  $schema: typeof MODULE_METADATA_JSON_SCHEMA
  schemaVersion: 2
  generatedBy: string
  note: string
  $defs?: Readonly<Record<string, JsonSchemaObject>>
  modules: readonly TModule[]
}>

export type ModuleMetadataPooledDocument<TModule> = Readonly<{
  $schema: typeof MODULE_METADATA_JSON_SCHEMA
  schemaVersion: 2
  $defs?: Readonly<Record<string, JsonSchemaObject>>
  modules: readonly TModule[]
}>

export function poolModuleMetadataSchemas<TModule>(module: TModule): ModuleMetadataSchemaPoolResult<TModule> {
  const pool = new Map<string, JsonSchemaObject>()
  const pooledModule = visitMetadataNode(module, pool)
  const reachable = collectReachableDefNames(pooledModule, pool)
  const defs: Record<string, JsonSchemaObject> = {}
  for (const name of [...reachable].sort((left, right) => left.localeCompare(right))) {
    const schema = pool.get(name)
    const finalized = schema === undefined ? undefined : finalizeSchemaObject(schema)
    if (finalized !== undefined) defs[name] = finalized
  }
  return {
    module: pooledModule as TModule,
    defs,
  }
}

export function mergeModuleSchemaDefs(
  results: ReadonlyArray<ModuleMetadataSchemaPoolResult<unknown>>,
): Readonly<Record<string, JsonSchemaObject>> {
  const merged = new Map<string, JsonSchemaObject>()
  for (const result of results) {
    for (const [name, schema] of Object.entries(result.defs)) {
      mergeDefinition(merged, name, schema)
    }
  }
  const reachable = collectReachableDefNamesFromModules(
    results.map(result => result.module),
    merged,
  )
  return Object.fromEntries(
    [...merged.entries()]
      .filter(([name]) => reachable.has(name))
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

export function buildModuleMetadataRuntimeDocument<TModule>(options: {
  generatedBy: string
  note: string
  modules: readonly TModule[]
}): ModuleMetadataRuntimeDocument<TModule> {
  const results = options.modules.map(module => poolModuleMetadataSchemas(module))
  const defs = mergeModuleSchemaDefs(results)
  return finalizeMetadataDocument({
    $schema: MODULE_METADATA_JSON_SCHEMA,
    schemaVersion: 2,
    generatedBy: options.generatedBy,
    note: options.note,
    ...(Object.keys(defs).length === 0 ? {} : { $defs: defs }),
    modules: results.map(result => result.module),
  })
}

export function buildModuleMetadataPooledDocument<TModule>(
  modules: readonly TModule[],
): ModuleMetadataPooledDocument<TModule> {
  const results = modules.map(module => poolModuleMetadataSchemas(module))
  const defs = mergeModuleSchemaDefs(results)
  return finalizeMetadataDocument({
    $schema: MODULE_METADATA_JSON_SCHEMA,
    schemaVersion: 2,
    ...(Object.keys(defs).length === 0 ? {} : { $defs: defs }),
    modules: results.map(result => result.module),
  })
}

function finalizeMetadataDocument<TDocument extends { $defs?: Readonly<Record<string, JsonSchemaObject>>; modules: readonly unknown[] }>(
  document: TDocument,
): TDocument {
  const defs = document.$defs === undefined
    ? undefined
    : Object.fromEntries(
      Object.entries(document.$defs).map(([name, schema]) => [name, finalizeSchema(schema)]),
    )
  return {
    ...document,
    ...(defs === undefined ? {} : { $defs: defs }),
    modules: document.modules.map(module => standardizeMetadataModule(module)),
  }
}

function standardizeMetadataModule(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => standardizeMetadataModule(item))
  }
  if (!isPlainObject(value)) return value

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (SCHEMA_SLOT_KEYS.has(key)) {
      output[key] = finalizeSchema(child)
      continue
    }
    output[key] = standardizeMetadataModule(child)
  }
  return output
}

function collectReachableDefNamesFromModules(
  modules: readonly unknown[],
  pool: Map<string, JsonSchemaObject>,
): Set<string> {
  const refs = new Set<string>()
  for (const module of modules) visitSchemaRefs(module, refs)

  const queue = [...refs]
  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined) continue
    const def = pool.get(name)
    if (def === undefined) continue
    const nested = new Set<string>()
    visitSchemaRefs(def, nested)
    for (const nestedName of nested) {
      if (!refs.has(nestedName)) {
        refs.add(nestedName)
        queue.push(nestedName)
      }
    }
  }
  return refs
}

function visitMetadataNode(value: unknown, pool: Map<string, JsonSchemaObject>): unknown {
  if (Array.isArray(value)) {
    return value.map(item => visitMetadataNode(item, pool))
  }
  if (!isPlainObject(value)) return value

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (SCHEMA_SLOT_KEYS.has(key)) {
      output[key] = externalizeSchema(child, pool, new Set())
      continue
    }
    output[key] = visitMetadataNode(child, pool)
  }
  return output
}

function externalizeSchema(
  value: unknown,
  pool: Map<string, JsonSchemaObject>,
  pending: Set<string>,
): JsonSchemaValue {
  const extracted = extractJsonSchemaLocalDefs(value)
  hoistLocalDefinitionRecord(extracted.defs, pool, pending)
  const standardizedInput = finalizeSchema(extracted.schema)
  if (typeof standardizedInput === 'boolean') return standardizedInput
  if (!isJsonSchemaObject(standardizedInput)) return true

  hoistLocalDefs(standardizedInput, pool, pending)

  if (typeof standardizedInput.$ref === 'string' && standardizedInput.$ref.length > 0) {
    return createReferenceSchema(normalizeDefsRef(standardizedInput.$ref), standardizedInput)
  }

  const { $defs: _localDefs, ...previewSource } = standardizedInput
  void _localDefs
  const normalizedPreview = normalizeJsonSchemaObject(previewSource)
  if (isArraySchema(normalizedPreview)) {
    return externalizeArraySchema(standardizedInput, pool, pending)
  }
  if (shouldKeepSchemaInline(normalizedPreview)) {
    return finalizeSchema(canonicalizeSchemaBody(standardizedInput, pool, pending))
  }

  const name = resolveDefinitionName(normalizedPreview)
  if (pool.has(name)) {
    return createReferenceSchema(`#/$defs/${name}`, standardizedInput)
  }
  if (pending.has(name)) {
    return createReferenceSchema(`#/$defs/${name}`, standardizedInput)
  }

  pending.add(name)
  try {
    const canonical = finalizeSchema(canonicalizeSchemaBody(standardizedInput, pool, pending))
    if (!isJsonSchemaObject(canonical)) {
      return createReferenceSchema(`#/$defs/${name}`, standardizedInput)
    }
    mergeDefinition(pool, name, canonical)
    return createReferenceSchema(`#/$defs/${name}`, standardizedInput)
  } finally {
    pending.delete(name)
  }
}

function createReferenceSchema(ref: string, source?: JsonSchemaObject): JsonSchemaValue {
  return finalizeSchema({
    $ref: ref,
    ...(source?.description === undefined ? {} : { description: source.description }),
  })
}

function finalizeSchema(value: unknown): JsonSchemaValue {
  return standardizeJsonSchema(value) as JsonSchemaValue
}

function finalizeSchemaObject(value: unknown): JsonSchemaObject | undefined {
  const finalized = finalizeSchema(value)
  return isJsonSchemaObject(finalized) ? finalized : undefined
}

function externalizeArraySchema(
  value: JsonSchemaObject,
  pool: Map<string, JsonSchemaObject>,
  pending: Set<string>,
): JsonSchemaValue {
  const canonical = finalizeSchema(canonicalizeArraySchema(value, pool, pending))
  if (!isJsonSchemaObject(canonical)) {
    return true
  }
  const name = resolveArrayDefinitionName(canonical)
  if (pool.has(name)) {
    return createReferenceSchema(`#/$defs/${name}`, value)
  }
  mergeDefinition(pool, name, canonical)
  return createReferenceSchema(`#/$defs/${name}`, value)
}

function resolveArrayDefinitionName(schema: JsonSchemaObject): string {
  const items = schema.items
  if (typeof items === 'boolean') {
    return items ? 'ArrayOf_any' : 'ArrayOf_never'
  }
  if (isPlainObject(items)) {
    if (typeof items.$ref === 'string' && items.$ref.startsWith('#/$defs/')) {
      const itemDefName = items.$ref.slice('#/$defs/'.length)
      return jsonSchemaDefinitionName(`ArrayOf_${itemDefName}`)
    }
    const inlineItemName = resolveInlineItemArrayName(items)
    if (inlineItemName !== undefined) return inlineItemName
  }
  if (Array.isArray(schema.prefixItems)) {
    return `AnonArray_${stableSchemaHash(schema)}`
  }
  return `AnonArray_${stableSchemaHash(schema)}`
}

function resolveInlineItemArrayName(items: JsonSchemaObject): string | undefined {
  if (items['const'] !== undefined) {
    return `ArrayOf_${stableSchemaHash(items)}`
  }
  const keys = Object.keys(items).filter(key => key !== 'title' && key !== 'description')
  if (keys.length === 1 && keys[0] === 'type') {
    const typeValue = items.type
    if (typeof typeValue === 'string') return jsonSchemaDefinitionName(`ArrayOf_${typeValue}`)
    if (Array.isArray(typeValue) && typeValue.length > 0) {
      return jsonSchemaDefinitionName(`ArrayOf_${typeValue.map(String).join('_')}`)
    }
  }
  return undefined
}

function hoistLocalDefs(
  value: JsonSchemaObject,
  pool: Map<string, JsonSchemaObject>,
  pending: Set<string>,
): void {
  const localDefs = value.$defs
  if (localDefs === undefined) return
  hoistLocalDefinitionRecord(localDefs, pool, pending)
}

function hoistLocalDefinitionRecord(
  localDefs: Readonly<Record<string, unknown>>,
  pool: Map<string, JsonSchemaObject>,
  pending: Set<string>,
): void {
  for (const [rawName, definition] of Object.entries(localDefs)) {
    const externalized = externalizeSchema(definition, pool, pending)
    if (typeof externalized === 'object' && typeof externalized.$ref === 'string') {
      const name = externalized.$ref.slice('#/$defs/'.length)
      const existing = pool.get(name)
      if (existing !== undefined) {
        mergeDefinition(pool, jsonSchemaDefinitionName(rawName), existing)
      }
      continue
    }
    if (isJsonSchemaObject(externalized)) {
      mergeDefinition(pool, jsonSchemaDefinitionName(rawName), externalized)
    }
  }
}

function canonicalizeSchemaBody(
  value: JsonSchemaObject,
  pool: Map<string, JsonSchemaObject>,
  pending: Set<string>,
): JsonSchemaObject {
  const { $defs: _ignored, ...rest } = value
  const output: JsonSchemaObject = { ...rest }

  if (output.properties !== undefined) {
    output.properties = mapSchemaRecord(output.properties, pool, pending)
  }
  if (output.items !== undefined && !isArraySchema(output)) {
    output.items = externalizeSchema(output.items, pool, pending)
  }
  if (output.additionalProperties !== undefined) {
    output.additionalProperties = externalizeSchema(output.additionalProperties, pool, pending)
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    const items = output[keyword]
    if (Array.isArray(items)) {
      output[keyword] = items.map(item => externalizeSchema(item, pool, pending))
    }
  }

  return normalizeJsonSchemaObject(output)
}

function canonicalizeArraySchema(
  value: JsonSchemaObject,
  pool: Map<string, JsonSchemaObject>,
  pending: Set<string>,
): JsonSchemaObject {
  const { $defs: _ignored, title: _title, ...rest } = value
  void _ignored
  void _title
  const output: JsonSchemaObject = { ...rest, type: 'array' }

  if (output.items !== undefined) {
    output.items = externalizeSchema(output.items, pool, pending)
  }
  if (Array.isArray(output.prefixItems)) {
    output.prefixItems = output.prefixItems.map(item => externalizeSchema(item, pool, pending))
  }
  if (output.additionalProperties !== undefined) {
    output.additionalProperties = externalizeSchema(output.additionalProperties, pool, pending)
  }

  return output
}

function isArraySchema(schema: JsonSchemaObject): boolean {
  if (schema.type === 'array') return true
  return Array.isArray(schema.type) && schema.type.includes('array')
}

function mapSchemaRecord(
  record: Readonly<Record<string, JsonSchemaValue>>,
  pool: Map<string, JsonSchemaObject>,
  pending: Set<string>,
): Record<string, JsonSchemaValue> {
  return Object.fromEntries(
    Object.entries(record).map(([name, schema]) => [name, externalizeSchema(schema, pool, pending)]),
  )
}

function normalizeJsonSchemaObject(value: JsonSchemaObject): JsonSchemaObject {
  const finalized = finalizeSchema(value)
  if (!isJsonSchemaObject(finalized)) return value
  return finalized
}

function normalizeDefsRef(ref: string): string {
  const trimmed = ref.trim()
  if (trimmed.startsWith('#/$defs/')) return trimmed
  if (trimmed.startsWith('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(trimmed)) return trimmed
  return `#/$defs/${jsonSchemaDefinitionName(trimmed)}`
}

function resolveDefinitionName(schema: JsonSchemaObject): string {
  if (typeof schema.title === 'string' && isUsefulDefinitionName(schema.title) && !isTitleOnlyStub(schema)) {
    return jsonSchemaDefinitionName(schema.title)
  }

  return `AnonSchema_${stableSchemaHash(schema)}`
}

function stableSchemaHash(schema: JsonSchemaObject): string {
  return createHash('sha1').update(stableStringify(schema)).digest('hex').slice(0, 12)
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`
  if (!isPlainObject(value)) return JSON.stringify(value)
  const keys = Object.keys(value).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

function mergeDefinition(
  pool: Map<string, JsonSchemaObject>,
  name: string,
  schema: JsonSchemaObject,
): void {
  const normalizedName = jsonSchemaDefinitionName(name)
  const finalized = finalizeSchema(schema)
  if (!isJsonSchemaObject(finalized)) return
  const existing = pool.get(normalizedName)
  if (existing === undefined) {
    pool.set(normalizedName, finalized)
    return
  }
  if (JSON.stringify(existing) === JSON.stringify(finalized)) return
  const existingScore = scoreSchemaRichness(existing)
  const incomingScore = scoreSchemaRichness(finalized)
  if (incomingScore > existingScore) {
    pool.set(normalizedName, finalized)
  }
}

function scoreSchemaRichness(schema: JsonSchemaObject): number {
  let score = 0

  if (typeof schema['description'] === 'string' && schema['description'].trim().length > 0) score += 1
  if (Array.isArray(schema.required)) score += schema.required.length
  if (Array.isArray(schema.enum)) score += schema.enum.length * 2
  if ('const' in schema) score += 2

  if (schema.properties !== undefined) {
    const entries = Object.entries(schema.properties)
    score += entries.length * 8
    for (const [, propertySchema] of entries) {
      if (propertySchema === true) {
        score -= 6
        continue
      }
      if (typeof propertySchema === 'object' && isJsonSchemaObject(propertySchema)) {
        score += scoreSchemaRichness(propertySchema)
      }
    }
  }

  if (typeof schema.items === 'object' && isJsonSchemaObject(schema.items)) {
    score += scoreSchemaRichness(schema.items)
  } else if (schema.items === true) {
    score += 1
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf', 'prefixItems'] as const) {
    const branch = schema[keyword]
    if (!Array.isArray(branch)) continue
    score += branch.length
    for (const item of branch) {
      if (typeof item === 'object' && isJsonSchemaObject(item)) {
        score += scoreSchemaRichness(item)
      }
    }
  }

  if (schema.additionalProperties === true) score -= 20
  if (isTitleOnlyStub(schema)) score -= 100

  return score
}

function collectReachableDefNames(
  module: unknown,
  pool: Map<string, JsonSchemaObject>,
): Set<string> {
  const refs = new Set<string>()
  visitSchemaRefs(module, refs)

  const queue = [...refs]
  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined) continue
    const def = pool.get(name)
    if (def === undefined) continue
    const nested = new Set<string>()
    visitSchemaRefs(def, nested)
    for (const nestedName of nested) {
      if (!refs.has(nestedName)) {
        refs.add(nestedName)
        queue.push(nestedName)
      }
    }
  }
  return refs
}

function visitSchemaRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) visitSchemaRefs(item, refs)
    return
  }
  if (!isPlainObject(value)) return

  const ref = value['$ref']
  if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
    refs.add(ref.slice('#/$defs/'.length))
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === '$defs') continue
    visitSchemaRefs(child, refs)
  }
}

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  if (!isPlainObject(value)) return false
  return '$ref' in value
    || '$defs' in value
    || 'type' in value
    || 'properties' in value
    || 'items' in value
    || 'anyOf' in value
    || 'oneOf' in value
    || 'allOf' in value
    || 'enum' in value
    || 'const' in value
    || 'additionalProperties' in value
    || 'prefixItems' in value
    || 'title' in value
    || 'description' in value
}

function isUsefulDefinitionName(name: string): boolean {
  return name.length > 0 && name !== '__type' && !name.startsWith('__')
}

function shouldKeepSchemaInline(schema: JsonSchemaObject): boolean {
  if (typeof schema.$ref === 'string') return true

  if (typeof schema.title === 'string' && isUsefulDefinitionName(schema.title) && !isTitleOnlyStub(schema)) {
    return false
  }

  if (isTitleOnlyStub(schema)) return true
  if (isAnnotationOnlySchema(schema)) return true
  if (isPrimitiveTypeSchema(schema)) return true
  if (isInlineEnumSchema(schema)) return true
  if (isConstSchema(schema)) return true
  if (isEmptyObjectSchema(schema)) return true

  if (schema.properties !== undefined) {
    const entries = Object.entries(schema.properties)
    if (entries.length === 0) return true
    if (entries.length <= 8) return true
  }

  return false
}

function isPrimitiveTypeSchema(schema: JsonSchemaObject): boolean {
  const keys = Object.keys(schema).filter(key => key !== 'title' && key !== 'description')
  if (keys.length !== 1 || keys[0] !== 'type') return false
  const typeValue = schema.type
  if (typeof typeValue === 'string') return true
  return Array.isArray(typeValue) && typeValue.length > 0
}

function isAnnotationOnlySchema(schema: JsonSchemaObject): boolean {
  const keys = Object.keys(schema)
  // description-only schema 是 Draft 2020-12 的“允许任意值 + 注释”形态。
  // 这里必须内联保留，不能池化成匿名 $defs，否则函数参数/unknown 字段语义会掉成 true。
  return keys.length > 0 && keys.every(key => key === 'title' || key === 'description')
}

function isInlineEnumSchema(schema: JsonSchemaObject): boolean {
  const keys = Object.keys(schema).filter(key => key !== 'title' && key !== 'description')
  if (keys.includes('enum') && Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (keys.length === 1) return true
    if (keys.length === 2 && keys.includes('type')) return true
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schema.oneOf.every(item => {
      if (typeof item === 'boolean') return true
      return isPlainObject(item) && 'const' in item
    })
  }
  return false
}

function isConstSchema(schema: JsonSchemaObject): boolean {
  return 'const' in schema
}

function isTitleOnlyStub(schema: JsonSchemaObject): boolean {
  const keys = Object.keys(schema)
  if (keys.length === 2 && keys.includes('type') && keys.includes('title') && schema.type === 'object') {
    return true
  }
  return keys.length === 1 && keys[0] === 'type' && schema.type === 'object'
}

function isEmptyObjectSchema(schema: JsonSchemaObject): boolean {
  return schema.type === 'object'
    && schema.properties !== undefined
    && Object.keys(schema.properties).length === 0
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
