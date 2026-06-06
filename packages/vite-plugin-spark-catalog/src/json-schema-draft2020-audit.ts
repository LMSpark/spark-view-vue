import { JSON_SCHEMA_DRAFT_2020_12 } from './json-schema-standardize'

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
  if (!isPlainObject(value)) {
    issues.push({ path, rule: 'INVALID_SCHEMA_NODE', detail: 'schema node must be boolean or object' })
    return
  }

  if (typeof value.$ref === 'string') {
    if (!value.$ref.startsWith('#/$defs/')) {
      issues.push({ path, rule: 'REF_TARGET', detail: 'module metadata schema $ref must target #/$defs/*' })
    }
    const siblings = Object.keys(value).filter(key => key !== '$ref')
    if (siblings.length > 0) {
      issues.push({ path, rule: 'REF_WITH_SIBLINGS', detail: `$ref must be the only keyword; found ${siblings.join(', ')}` })
    }
    return
  }

  if (value.type === 'function') {
    issues.push({ path, rule: 'INVALID_TYPE', detail: 'function is not a Draft 2020-12 type' })
  }

  if (typeof value.type === 'string' && !VALID_SCHEMA_TYPES.has(value.type)) {
    issues.push({ path, rule: 'INVALID_TYPE', detail: String(value.type) })
  }
  if (Array.isArray(value.type)) {
    for (const typeName of value.type) {
      if (typeof typeName !== 'string' || !VALID_SCHEMA_TYPES.has(typeName)) {
        issues.push({ path, rule: 'INVALID_TYPE', detail: String(typeName) })
      }
    }
  }

  if (value.const !== undefined && value.type !== undefined) {
    issues.push({ path, rule: 'REDUNDANT_CONST_TYPE', detail: 'const schemas should not repeat type' })
  }

  if (value.type === 'null' && value.const === null) {
    issues.push({ path, rule: 'REDUNDANT_NULL', detail: 'use type null or const null, not both' })
  }

  if (value.type === 'boolean' && Array.isArray(value.enum) && value.enum.length === 2
    && value.enum.includes(false) && value.enum.includes(true)) {
    issues.push({ path, rule: 'REDUNDANT_BOOLEAN_ENUM', detail: 'use { type: boolean } instead' })
  }

  if (Array.isArray(value.enum) && value.enum.length === 1) {
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

  if (value.type === 'array' || (Array.isArray(value.type) && value.type.includes('array'))) {
    if (value.items === undefined && value.prefixItems === undefined) {
      issues.push({ path, rule: 'ARRAY_WITHOUT_ITEMS', detail: 'array schemas must declare items or prefixItems' })
    }
  }

  if (typeof value.$ref === 'string' && value.$ref.includes('JsonSchema_')) {
    issues.push({ path, rule: 'LEGACY_PRIMITIVE_REF', detail: value.$ref })
  }

  if (value.properties !== undefined && isPlainObject(value.properties)) {
    for (const [name, property] of Object.entries(value.properties)) {
      visitSchema(property, `${path}.properties.${name}`, issues)
    }
  }

  if (value.items !== undefined) visitSchema(value.items, `${path}.items`, issues)
  if (Array.isArray(value.prefixItems)) {
    for (const [index, item] of value.prefixItems.entries()) {
      visitSchema(item, `${path}.prefixItems[${index}]`, issues)
    }
  }
  if (value.additionalProperties !== undefined) {
    visitSchema(value.additionalProperties, `${path}.additionalProperties`, issues)
  }
  if (value.not !== undefined) visitSchema(value.not, `${path}.not`, issues)
}

export function auditModuleMetadataDocument(document: unknown): readonly Draft2020AuditIssue[] {
  if (!isPlainObject(document)) return [{ path: '$', rule: 'INVALID_DOCUMENT', detail: 'expected object' }]
  if (document.$schema !== JSON_SCHEMA_DRAFT_2020_12) {
    return [{ path: '$.$schema', rule: 'SCHEMA_DECLARATION', detail: String(document.$schema ?? 'missing') }]
  }

  const issues: Draft2020AuditIssue[] = []
  const defs = document.$defs
  if (isPlainObject(defs)) {
    for (const [name, schema] of Object.entries(defs)) {
      visitSchema(schema, `$.$defs.${name}`, issues)
    }
  }

  const modules = document.modules
  if (Array.isArray(modules)) {
    for (const [index, module] of modules.entries()) {
      visitMetadataModule(module, `$.modules[${index}]`, issues)
    }
  }
  return issues
}

function visitMetadataModule(value: unknown, path: string, issues: Draft2020AuditIssue[]): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) visitMetadataModule(item, `${path}[${index}]`, issues)
    return
  }
  if (!isPlainObject(value)) return

  for (const [key, child] of Object.entries(value)) {
    if (key === 'paramsSchema' || key === 'resultSchema' || key === 'schema') {
      visitSchema(child, `${path}.${key}`, issues)
      continue
    }
    visitMetadataModule(child, `${path}.${key}`, issues)
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
