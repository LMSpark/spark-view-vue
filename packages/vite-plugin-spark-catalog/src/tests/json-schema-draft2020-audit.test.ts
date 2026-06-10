import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assertDraft2020Schema, findMissingJsonSchemaDefRefs } from '@spark-appworks/spark-json-document'
import { auditModuleMetadataDocument } from '../module-metadata-draft2020-audit'
import { poolModuleMetadataSchemas } from '../module-schema-pool'
import { buildModuleMetadataRuntimeDocument } from '../module-schema-pool'
import { standardizeJsonSchema } from '@spark-appworks/spark-json-document'

describe('Draft 2020-12 schema audit', () => {
  it('standardizes redundant null and const shapes', () => {
    expect(standardizeJsonSchema({ type: 'null', const: null })).toEqual({ type: 'null' })
    expect(standardizeJsonSchema({ type: 'boolean', const: true })).toEqual({ const: true })
    expect(standardizeJsonSchema({
      anyOf: [{ type: 'null', const: null }, { type: 'string' }],
    })).toEqual({ type: ['null', 'string'] })
    expect(standardizeJsonSchema({
      anyOf: [{ const: false }, { const: true }, { $ref: '#/$defs/Foo' }],
    })).toEqual({
      anyOf: [{ type: 'boolean' }, { $ref: '#/$defs/Foo' }],
    })
  })

  it('passes audit for pooled module fixtures', () => {
    const module = {
      schemaVersion: 2,
      rootApi: {
        kind: 'project',
        attributes: [{ name: 'projectId', schema: { type: 'string' }, readable: true, writable: false }],
        actions: [
          {
            name: 'list',
            paramsSchema: { type: 'object', properties: {} },
            resultSchema: {
              type: 'array',
              items: {
                type: 'object',
                title: 'ProjectPageNodeSummary',
                properties: { pageId: { type: 'string' } },
                required: ['pageId'],
              },
            },
          },
        ],
      },
      apiRegistry: {},
    }

    const pooled = poolModuleMetadataSchemas(module)
    const document = buildModuleMetadataRuntimeDocument({
      generatedBy: 'test',
      note: 'test',
      modules: [pooled.module],
    })

    assertDraft2020Schema(document)
    expect(auditModuleMetadataDocument(document)).toEqual([])
  })

  it('passes audit for generated runtime metadata three times', () => {
    const files = [
      'generated/vcm/dist/project-page-surface/project-page-surface-module-metadata.runtime.generated.json',
    ]
    for (const relativePath of files) {
      const absolutePath = resolve(process.cwd(), relativePath)
      const raw = readFileSync(absolutePath, 'utf8')
      for (let pass = 1; pass <= 3; pass += 1) {
        const document: unknown = JSON.parse(raw)
        const issues = auditModuleMetadataDocument(document)
        expect(issues, `${relativePath} audit pass ${pass}`).toEqual([])
        expect(findMissingJsonSchemaDefRefs(document), `${relativePath} missing $defs pass ${pass}`).toEqual([])
      }
    }
  })

  it('does not emit a runtime audit generated JSON file', () => {
    const relativePath = 'src/services/page-design/page-design-module-metadata.runtime.audit.generated.json'
    expect(existsSync(resolve(process.cwd(), relativePath))).toBe(false)
  })
})
