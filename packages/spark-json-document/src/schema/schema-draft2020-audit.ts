import { isRecord } from '@spark-appworks/spark-utils'

const VALID_SCHEMA_TYPES = new Set([
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'integer',
  'string',
])

export type Draft2020AuditIssue = Readonly<{
  path: string
  rule: string
  detail: string
}>

export function auditDraft2020Schema(value: unknown, path = '$'): readonly Draft2020AuditIssue[] {
  const issues: Draft2020AuditIssue[] = []
  visitSchema(value, path, issues)
  return issues
}

export function assertDraft2020Schema(value: unknown, path = '$'): void {
  const issues = auditDraft2020Schema(value, path)
  if (issues.length === 0) return
  const sample = issues.slice(0, 5).map(issue => `${issue.path}: ${issue.rule} (${issue.detail})`).join('\n')
  throw new Error(`Draft 2020-12 audit failed with ${issues.length} issue(s):\n${sample}`)
}

function visitSchema(value: unknown, path: string, issues: Draft2020AuditIssue[]): void {
  if (typeof value === 'boolean') return
  if (!isRecord(value)) {
    issues.push({ path, rule: 'INVALID_SCHEMA_NODE', detail: 'schema node must be boolean or object' })
    return
  }

  const ref = value['$ref']
  if (typeof ref === 'string') {
    if (!ref.startsWith('#/$defs/')) {
      issues.push({ path, rule: 'REF_TARGET', detail: 'schema $ref must target #/$defs/*' })
    }
    const siblings = Object.keys(value).filter(key => key !== '$ref')
    if (siblings.length > 0) {
      issues.push({ path, rule: 'REF_WITH_SIBLINGS', detail: `$ref must be the only keyword; found ${siblings.join(', ')}` })
    }
    return
  }

  const schemaType = value['type']
  if (schemaType === 'function') {
    issues.push({ path, rule: 'INVALID_TYPE', detail: 'function is not a Draft 2020-12 type' })
  }

  if (typeof schemaType === 'string' && !VALID_SCHEMA_TYPES.has(schemaType)) {
    issues.push({ path, rule: 'INVALID_TYPE', detail: schemaType })
  }
  if (Array.isArray(schemaType)) {
    for (const typeName of schemaType) {
      if (typeof typeName !== 'string' || !VALID_SCHEMA_TYPES.has(typeName)) {
        issues.push({ path, rule: 'INVALID_TYPE', detail: String(typeName) })
      }
    }
  }

  if (value['const'] !== undefined && schemaType !== undefined) {
    issues.push({ path, rule: 'REDUNDANT_CONST_TYPE', detail: 'const schemas should not repeat type' })
  }

  if (schemaType === 'null' && value['const'] === null) {
    issues.push({ path, rule: 'REDUNDANT_NULL', detail: 'use type null or const null, not both' })
  }

  const enumValues = value['enum']
  if (schemaType === 'boolean' && Array.isArray(enumValues) && enumValues.length === 2
    && enumValues.includes(false) && enumValues.includes(true)) {
    issues.push({ path, rule: 'REDUNDANT_BOOLEAN_ENUM', detail: 'use { type: boolean } instead' })
  }

  if (Array.isArray(enumValues) && enumValues.length === 1) {
    issues.push({ path, rule: 'ENUM_SINGLE', detail: 'single-value enum should be const' })
  }

  for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branches = value[keyword]
    if (!Array.isArray(branches)) continue
    if (branches.length === 1) {
      issues.push({ path, rule: 'SINGLE_COMBINATOR', detail: `${keyword} must not contain a single branch` })
    }
    for (const [index, branch] of branches.entries()) {
      visitSchema(branch, `${path}.${keyword}[${index}]`, issues)
    }
  }

  if (schemaType === 'array' || (Array.isArray(schemaType) && schemaType.includes('array'))) {
    if (value['items'] === undefined && value['prefixItems'] === undefined) {
      issues.push({ path, rule: 'ARRAY_WITHOUT_ITEMS', detail: 'array schemas must declare items or prefixItems' })
    }
  }

  if (typeof ref === 'string' && ref.includes('JsonSchema_')) {
    issues.push({ path, rule: 'LEGACY_PRIMITIVE_REF', detail: ref })
  }

  const properties = value['properties']
  if (properties !== undefined && isRecord(properties)) {
    for (const [name, property] of Object.entries(properties)) {
      visitSchema(property, `${path}.properties.${name}`, issues)
    }
  }

  const items = value['items']
  if (items !== undefined) visitSchema(items, `${path}.items`, issues)
  const prefixItems = value['prefixItems']
  if (Array.isArray(prefixItems)) {
    for (const [index, item] of prefixItems.entries()) {
      visitSchema(item, `${path}.prefixItems[${index}]`, issues)
    }
  }
  const additionalProperties = value['additionalProperties']
  if (additionalProperties !== undefined) {
    visitSchema(additionalProperties, `${path}.additionalProperties`, issues)
  }
  const notSchema = value['not']
  if (notSchema !== undefined) visitSchema(notSchema, `${path}.not`, issues)
}
