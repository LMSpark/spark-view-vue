/**
 * Module metadata schema inlining — delegates JSON Schema logic to spark-json-document.
 */

import {
  dereferenceSchemaSlotsInValue,
  type JsonSchemaDefs,
} from '@spark-appworks/spark-json-document'

import type { AiModuleMetadataJson } from './ai-api-object-metadata-schema'

export { dereferenceJsonSchema } from '@spark-appworks/spark-json-document'

const MODULE_METADATA_SCHEMA_SLOT_KEYS = ['paramsSchema', 'resultSchema', 'schema'] as const

export function dereferenceModuleMetadataSchemas(
  module: AiModuleMetadataJson,
  defs: JsonSchemaDefs | undefined,
): AiModuleMetadataJson {
  if (defs === undefined || Object.keys(defs).length === 0) return module
  const visited = dereferenceSchemaSlotsInValue(module, defs, MODULE_METADATA_SCHEMA_SLOT_KEYS)
  if (!isAiModuleMetadataJson(visited)) {
    throw new Error('dereferenceModuleMetadataSchemas produced invalid module metadata.')
  }
  return visited
}

function isAiModuleMetadataJson(value: unknown): value is AiModuleMetadataJson {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const schemaVersion = record['schemaVersion']
  if (schemaVersion !== 1 && schemaVersion !== 2) return false
  const rootApi = record['rootApi']
  return rootApi !== null && typeof rootApi === 'object' && !Array.isArray(rootApi)
}
