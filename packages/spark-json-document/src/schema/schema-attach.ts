/**
 * Attach document-level $defs to a schema root for AJV 2020 $ref resolution.
 */

import { isRecord } from '@spark-appworks/spark-utils'
import type { JsonSchema } from './schema-types'

export function attachJsonSchemaDefs(
  schema: unknown,
  defs?: Readonly<Record<string, JsonSchema>>,
): unknown {
  if (defs === undefined || Object.keys(defs).length === 0) return schema
  if (!isRecord(schema)) return schema
  const existing = schema['$defs']
  const mergedDefs = isRecord(existing)
    ? { ...defs, ...existing }
    : { ...defs }
  return { ...schema, $defs: mergedDefs }
}
