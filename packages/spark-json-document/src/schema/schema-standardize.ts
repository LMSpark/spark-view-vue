/**
 * @module @spark-appworks/spark-json-document:schema/schema-standardize
 * 职责：提供 JSON 文档和 schema 处理中的 schema-standardize 能力，围绕 StandardJsonSchema、StandardJsonSchemaObject 管理 schema 标准化、解析、校验或树策略。
 * 边界：只处理 JSON/schema/tree 抽象，不依赖 SPARK 页面运行时，也不直接操作业务 DataSet。
 * AI用途：生成或校验 JSON 配置结构时，用本模块确认 schema/schema-standardize 的 schema 语义。
 */
/**
 * Canonicalize JSON Schema fragments to Draft 2020-12 shapes used by spark-json-document.
 *
 * Every schema node — primitives, pooled $defs, arrays, objects — must pass this pass.
 */

export const JSON_SCHEMA_DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema'

const VALID_SCHEMA_TYPES = new Set([
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'integer',
  'string',
])

const SCHEMA_KEY_ORDER = [
  '$ref',
  'type',
  'title',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'prefixItems',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  'not',
  '$defs',
] as const

/** Standard Json Schema 的语义模型。 */
export type StandardJsonSchema = boolean | StandardJsonSchemaObject

/** Standard Json Schema Object 的语义模型。 */
export type StandardJsonSchemaObject = {
  [keyword: string]: unknown
    /** $ref 字段。 */
$ref?: string
    /** 类型标识。 */
type?: string | readonly string[]
    /** properties 字段。 */
properties?: Readonly<Record<string, StandardJsonSchema>>
    /** 是否必填。 */
required?: readonly string[]
    /** items 字段。 */
items?: StandardJsonSchema
    /** prefix Items 字段。 */
prefixItems?: readonly StandardJsonSchema[]
    /** additional Properties 字段。 */
additionalProperties?: StandardJsonSchema
    /** enum 字段。 */
enum?: readonly unknown[]
    /** const 字段。 */
const?: unknown
    /** any Of 字段。 */
anyOf?: readonly StandardJsonSchema[]
    /** one Of 字段。 */
oneOf?: readonly StandardJsonSchema[]
    /** all Of 字段。 */
allOf?: readonly StandardJsonSchema[]
    /** not 字段。 */
not?: StandardJsonSchema
    /** 显示标题。 */
title?: string
    /** description 字段。 */
description?: string
    /** $defs 字段。 */
$defs?: Readonly<Record<string, StandardJsonSchema>>
}

export function standardizeJsonSchema(value: unknown): StandardJsonSchema {
  if (typeof value === 'boolean') return value
  if (!isPlainObject(value)) return true

  if (typeof value.$ref === 'string' && value.$ref.trim().length > 0) {
    return sortSchemaKeys({
      $ref: value.$ref.trim(),
      ...pickReferenceSchemaMeta(value),
    })
  }

  const literalOnly = normalizeLiteralOnlySchema(value)
  if (literalOnly !== undefined) return literalOnly

  if (value.type === 'function') return true

  const nullableUnion = tryStandardizeNullableUnion(value)
  if (nullableUnion !== undefined) return nullableUnion

  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = value[keyword]
    if (Array.isArray(branches) && branches.length === 1) {
      return mergeSchemaAnnotations(standardizeJsonSchema(branches[0]), value)
    }
  }

  const schemaType = sanitizeSchemaType(value.type)
  const singleConst = readSingleValueConst(value, schemaType)
  if (singleConst !== undefined) {
    return sortSchemaKeys(pickLiteralSchemaMeta(value, { const: singleConst }))
  }

  const output: StandardJsonSchemaObject = {}

  if (value.title !== undefined) output.title = value.title
  if (value.description !== undefined) output.description = value.description

  if (schemaType !== undefined) output.type = schemaType

  if (Array.isArray(value.enum) && value.enum.length > 0 && !isRedundantBooleanEnum(schemaType, value.enum)) {
    output.enum = Array.from(value.enum)
  }

  if (value.properties !== undefined) {
    output.properties = mapSchemaRecord(value.properties)
  }

  if (Array.isArray(value.required) && value.required.length > 0) {
    output.required = Array.from(value.required)
  }

  if (value.additionalProperties !== undefined) {
    output.additionalProperties = standardizeJsonSchema(value.additionalProperties)
  }

  if (value.not !== undefined) {
    output.not = standardizeJsonSchema(value.not)
  }

  if (value.$defs !== undefined && isPlainObject(value.$defs)) {
    output.$defs = Object.fromEntries(
      Object.entries(value.$defs).map(([name, definition]) => [name, standardizeJsonSchema(definition)]),
    )
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = value[keyword]
    if (Array.isArray(branches) && branches.length > 1) {
      const simplified = simplifyCombinatorBranches(branches)
      if (simplified.length === 1) {
        return standardizeJsonSchema(simplified[0])
      }
      output[keyword] = simplified
    }
  }

  if (isArraySchemaType(output.type) || value.items !== undefined || value.prefixItems !== undefined) {
    return sortSchemaKeys(standardizeArraySchema(output, value))
  }

  if (output.type === 'object' || output.properties !== undefined) {
    output.type ??= 'object'
    const titleOnlyStub = output.properties === undefined
      && output.additionalProperties === undefined
      && typeof output.title === 'string'
    if (!titleOnlyStub && output.properties === undefined && output.additionalProperties === undefined) {
      output.additionalProperties = true
    }
    if (output.properties !== undefined && Object.keys(output.properties).length === 0 && output.additionalProperties === undefined) {
      output.additionalProperties = false
    }
  }

  if (Object.keys(output).length === 0) return true
  return sortSchemaKeys(output)
}

function standardizeArraySchema(
  output: StandardJsonSchemaObject,
  source: StandardJsonSchemaObject,
): StandardJsonSchemaObject {
  const arraySchema: StandardJsonSchemaObject = {
    ...output,
    type: 'array',
  }

  if (Array.isArray(source.prefixItems)) {
    arraySchema.prefixItems = source.prefixItems.map(item => standardizeJsonSchema(item))
  }

  if (source.items !== undefined) {
    arraySchema.items = standardizeJsonSchema(source.items)
  } else if (arraySchema.prefixItems === undefined) {
    arraySchema.items = true
  }

  return arraySchema
}

function tryStandardizeNullableUnion(value: StandardJsonSchemaObject): StandardJsonSchema | undefined {
  if (!Array.isArray(value.anyOf) || value.anyOf.length !== 2) return undefined

  const branches = value.anyOf.map(branch => standardizeJsonSchema(branch))
  const nullBranchIndex = branches.findIndex(branch => isNullOnlySchema(branch))
  if (nullBranchIndex < 0) return undefined

  const otherBranch = branches[nullBranchIndex === 0 ? 1 : 0]
  if (!isPlainObject(otherBranch) || otherBranch.type === undefined) return undefined

  const { anyOf: _ignored, oneOf: _ignoredOneOf, allOf: _ignoredAllOf, ...rest } = otherBranch
  void _ignored
  void _ignoredOneOf
  void _ignoredAllOf
  const otherType = otherBranch.type
  const mergedType = typeof otherType === 'string'
    ? sortUnionTypes([otherType, 'null'])
    : sortUnionTypes([...otherType, 'null'])

  return sortSchemaKeys({
    ...rest,
    type: mergedType,
  })
}

function normalizeLiteralOnlySchema(value: StandardJsonSchemaObject): StandardJsonSchema | undefined {
  if (value.type === 'null' || value.const === null) {
    return sortSchemaKeys(pickLiteralSchemaMeta(value, { type: 'null' }))
  }
  if (value.const !== undefined) {
    return sortSchemaKeys(pickLiteralSchemaMeta(value, { const: value.const }))
  }
  return undefined
}

function pickLiteralSchemaMeta(
  source: StandardJsonSchemaObject,
  body: StandardJsonSchemaObject,
): StandardJsonSchemaObject {
  return {
    ...(source.title !== undefined ? { title: source.title } : {}),
    ...(source.description !== undefined ? { description: source.description } : {}),
    ...body,
  }
}

function pickReferenceSchemaMeta(source: StandardJsonSchemaObject): StandardJsonSchemaObject {
  return {
    ...(source.description !== undefined ? { description: source.description } : {}),
  }
}

function mergeSchemaAnnotations(
  schema: StandardJsonSchema,
  source: StandardJsonSchemaObject,
): StandardJsonSchema {
  const description = typeof source.description === 'string' && source.description.trim().length > 0
    ? source.description
    : undefined
  if (description === undefined) return schema
  // 单分支 allOf/anyOf/oneOf 常用于“命名类型 $ref + 参数语义”包装；
  // 展开时必须保留外层 description，否则 ClassModel 的 @param 语义会在池化前丢失。
  if (schema === true) return { description }
  if (schema === false) return schema
  if (typeof schema.description === 'string' && schema.description.trim().length > 0) return schema
  return sortSchemaKeys({ ...schema, description })
}

function isNullOnlySchema(branch: StandardJsonSchema): boolean {
  if (!isPlainObject(branch)) return false
  if (branch.const === null) return true
  return branch.type === 'null'
    && branch.const === undefined
    && Object.keys(branch).every(key => key === 'type' || key === 'title' || key === 'description')
}

function simplifyCombinatorBranches(branches: readonly unknown[]): readonly StandardJsonSchema[] {
  const normalized = branches.map(branch => standardizeJsonSchema(branch))
  const withoutBooleanConsts = collapseBooleanConstBranches(normalized)
  if (withoutBooleanConsts.length === 1) return withoutBooleanConsts
  return withoutBooleanConsts
}

function collapseBooleanConstBranches(branches: readonly StandardJsonSchema[]): readonly StandardJsonSchema[] {
  const hasFalse = branches.some(branch => isPlainObject(branch) && branch.const === false)
  const hasTrue = branches.some(branch => isPlainObject(branch) && branch.const === true)
  if (!hasFalse || !hasTrue) return branches

  const rest = branches.filter(branch =>
    !(isPlainObject(branch) && (branch.const === false || branch.const === true)))
  return [{ type: 'boolean' }, ...rest]
}

function readSingleValueConst(
  value: StandardJsonSchemaObject,
  schemaType: string | readonly string[] | undefined,
): string | number | boolean | null | undefined {
  if (value.const !== undefined) {
    if (typeof value.const === 'string' || typeof value.const === 'number' || typeof value.const === 'boolean' || value.const === null) {
      return value.const
    }
    return undefined
  }
  if (!Array.isArray(value.enum) || value.enum.length !== 1) return undefined
  const onlyValue: unknown = value.enum[0]
  if (schemaType === 'boolean' && typeof onlyValue === 'boolean') return onlyValue
  if (schemaType === 'string' && typeof onlyValue === 'string') return onlyValue
  if ((schemaType === 'number' || schemaType === 'integer') && typeof onlyValue === 'number') return onlyValue
  if (schemaType === 'null' && onlyValue === null) return null
  return undefined
}

function mapSchemaRecord(record: Readonly<Record<string, unknown>>): Record<string, StandardJsonSchema> {
  return Object.fromEntries(
    Object.entries(record).map(([name, schema]) => [name, standardizeJsonSchema(schema)]),
  )
}

function sanitizeSchemaType(typeValue: unknown): string | readonly string[] | undefined {
  if (typeof typeValue === 'string') {
    return VALID_SCHEMA_TYPES.has(typeValue) ? typeValue : undefined
  }
  if (!Array.isArray(typeValue) || typeValue.length === 0) return undefined

  const normalized = [...new Set(
    typeValue.filter((item): item is string => typeof item === 'string' && VALID_SCHEMA_TYPES.has(item)),
  )]
  if (normalized.length === 0) return undefined
  const firstType = normalized[0]
  if (normalized.length === 1) return firstType
  return sortUnionTypes(normalized)
}

function sortUnionTypes(types: readonly string[]): readonly string[] {
  const order = ['null', 'boolean', 'integer', 'number', 'string', 'array', 'object']
  return [...types].sort((left, right) => order.indexOf(left) - order.indexOf(right))
}

function isArraySchemaType(typeValue: string | readonly string[] | undefined): boolean {
  if (typeValue === 'array') return true
  return Array.isArray(typeValue) && typeValue.includes('array')
}

function isRedundantBooleanEnum(
  typeValue: string | readonly string[] | undefined,
  enumValues: readonly unknown[],
): boolean {
  if (typeValue !== 'boolean') return false
  if (enumValues.length !== 2) return false
  return enumValues.includes(false) && enumValues.includes(true)
}

function sortSchemaKeys(schema: StandardJsonSchemaObject): StandardJsonSchemaObject {
  const sorted: Record<string, unknown> = {}
  for (const key of SCHEMA_KEY_ORDER) {
    const value = schema[key]
    if (value !== undefined) sorted[key] = value
  }
  for (const [key, value] of Object.entries(schema)) {
    if (sorted[key] === undefined) sorted[key] = value
  }
  return sorted
}

function isPlainObject(value: unknown): value is StandardJsonSchemaObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
