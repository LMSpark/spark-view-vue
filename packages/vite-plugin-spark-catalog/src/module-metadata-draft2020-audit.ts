/**
 * Draft 2020-12 audit for generated AI module metadata documents (business layer).
 */

import {
  auditDraft2020Schema,
  isRecord,
  JSON_SCHEMA_DRAFT_2020_12,
  type Draft2020AuditIssue,
} from '@spark-appworks/spark-json-document'

export const MODULE_METADATA_SCHEMA_SLOT_KEYS = ['paramsSchema', 'resultSchema', 'schema'] as const

const MODULE_METADATA_SCHEMA_SLOT_KEY_SET = new Set<string>(MODULE_METADATA_SCHEMA_SLOT_KEYS)

export function auditModuleMetadataDocument(document: unknown): readonly Draft2020AuditIssue[] {
  if (!isRecord(document)) return [{ path: '$', rule: 'INVALID_DOCUMENT', detail: 'expected object' }]
  if (document['$schema'] !== JSON_SCHEMA_DRAFT_2020_12) {
    return [{ path: '$.$schema', rule: 'SCHEMA_DECLARATION', detail: String(document['$schema'] ?? 'missing') }]
  }

  const issues: Draft2020AuditIssue[] = []
  const defs = document['$defs']
  if (isRecord(defs)) {
    for (const [name, schema] of Object.entries(defs)) {
      issues.push(...auditDraft2020Schema(schema, `$.$defs.${name}`))
    }
  }

  const modules = document['modules']
  if (Array.isArray(modules)) {
    for (const [index, module] of modules.entries()) {
      issues.push(...auditModuleMetadataNode(module, `$.modules[${index}]`))
    }
  }
  return issues
}

function auditModuleMetadataNode(value: unknown, path: string): readonly Draft2020AuditIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => auditModuleMetadataNode(item, `${path}[${index}]`))
  }
  if (!isRecord(value)) return []

  const issues: Draft2020AuditIssue[] = []
  for (const [key, child] of Object.entries(value)) {
    if (MODULE_METADATA_SCHEMA_SLOT_KEY_SET.has(key)) {
      issues.push(...auditDraft2020Schema(child, `${path}.${key}`))
      continue
    }
    issues.push(...auditModuleMetadataNode(child, `${path}.${key}`))
  }
  return issues
}
