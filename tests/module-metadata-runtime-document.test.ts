import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readModuleMetadataRuntimeDocument } from '@spark-appworks/spark-ai/vcm-native'

describe('readModuleMetadataRuntimeDocument', () => {
  it('parses generated pageDesign runtime metadata', () => {
    const raw: unknown = JSON.parse(readFileSync(
      resolve(process.cwd(), 'generated/vcm/dist/project-page-surface/project-page-surface-module-metadata.runtime.generated.json'),
      'utf8',
    ))
    const document = readModuleMetadataRuntimeDocument(raw)
    expect(document.schemaVersion).toBe(2)
    expect(document.modules.some(module => module.rootApi.kind === 'project')).toBe(true)
  })

  it('rejects invalid envelope', () => {
    expect(() => readModuleMetadataRuntimeDocument({ schemaVersion: 1 })).toThrow(/runtime document/u)
  })
})
