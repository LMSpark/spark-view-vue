import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  DTS_FILE_PROJECTION_VERSION,
} from '../class-model/dts-bundle-types'
import {
  readDtsClassModelBundleManifest,
  readDtsFileProjectionDocument,
} from '../class-model/read-dts-class-model-bundle-json'

const repoRoot = resolve(import.meta.dirname, '../../../../..')
const manifestPath = resolve(repoRoot, 'generated/dts-class-model/manifest.json')
const sampleProjectionPath = resolve(
  repoRoot,
  'generated/dts-class-model/files/declarations/packages/spark-utils/src/ai-model.d.ts.json',
)

describe('readDtsClassModelBundleJson', () => {
  it('parses generated manifest with structural validation', () => {
    const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const manifest = readDtsClassModelBundleManifest(raw)
    expect(manifest.schemaVersion).toBe(DTS_CLASS_MODEL_BUNDLE_VERSION)
    expect(manifest.protocol).toBe(DTS_CLASS_MODEL_BUNDLE_PROTOCOL)
    expect(Object.keys(manifest.classIndex).length).toBeGreaterThan(0)
    expect(Object.keys(manifest.files).length).toBeGreaterThan(0)
  })

  it('parses a generated per-file projection shard', () => {
    const raw: unknown = JSON.parse(readFileSync(sampleProjectionPath, 'utf8'))
    const projection = readDtsFileProjectionDocument(raw)
    expect(projection.schemaVersion).toBe(DTS_FILE_PROJECTION_VERSION)
    expect(projection.symbols.length).toBeGreaterThan(0)
    expect(Object.keys(projection.models).length).toBeGreaterThan(0)
  })

  it('rejects manifest with wrong protocol', () => {
    expect(() => readDtsClassModelBundleManifest({
      schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
      protocol: 'legacy',
      generatedAt: '2026-01-01T00:00:00.000Z',
      scannedFileCount: 0,
      files: {},
      classIndex: {},
    })).toThrow(/protocol/)
  })

  it('rejects projection missing required class model fields', () => {
    expect(() => readDtsFileProjectionDocument({
      schemaVersion: DTS_FILE_PROJECTION_VERSION,
      sourcePath: 'declarations/x.d.ts',
      symbols: ['Broken'],
      models: {
        Broken: {
          kind: 'Broken',
        },
      },
    })).toThrow(/className/)
  })
})
