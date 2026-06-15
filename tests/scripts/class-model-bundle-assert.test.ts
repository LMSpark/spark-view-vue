import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
// @ts-ignore TS7016 -- Node .mjs helper
import { assertClassModelBundleComplete, assertClassModelGuideExecutableSchemas, assertClassModelSemanticGapsZero } from '../../scripts/lib/class-model-bundle-assert.mjs'

const repoRoot = process.cwd()

describe('class-model-bundle-assert', () => {
  it('throws when manifest shard file is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      writeFileSync(join(root, 'manifest.json'), JSON.stringify({
        files: {
          'class-model-emit/foo.d.ts': { file: 'files/missing.json' },
        },
      }))

      expect(() => assertClassModelBundleComplete(root)).toThrow(/incomplete/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('passes when guide manifest shards are complete', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      mkdirSync(join(root, 'files'), { recursive: true })
      writeFileSync(join(root, 'files/foo.json'), JSON.stringify({
        models: {
          Demo: {
            shapeKind: 'function',
            jsonSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: {
                params: { type: 'object', properties: {} },
              },
            },
            methods: [{
              name: 'run',
            }],
          },
        },
      }))
      writeFileSync(join(root, 'manifest.json'), JSON.stringify({
        files: {
          'class-model-emit/foo.d.ts': { file: 'files/foo.json' },
        },
      }))

      expect(() => assertClassModelBundleComplete(root)).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws when manifest.json is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      expect(() => assertClassModelBundleComplete(root)).toThrow(/Missing .*manifest\.json/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws when guide shard method is missing executable schema in jsonSchema', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      mkdirSync(join(root, 'files'), { recursive: true })
      writeFileSync(join(root, 'files/foo.json'), JSON.stringify({
        models: {
          Demo: {
            shapeKind: 'function',
            jsonSchema: {
              $schema: 'https://json-schema.org/draft/2020-12/schema',
              type: 'object',
              properties: {},
            },
            methods: [{ name: 'run' }],
          },
        },
      }))
      writeFileSync(join(root, 'manifest.json'), JSON.stringify({
        files: {
          'class-model-emit/foo.d.ts': { file: 'files/foo.json' },
        },
      }))

      expect(() => assertClassModelGuideExecutableSchemas(root)).toThrow(/jsonSchema-only/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('passes jsonSchema-only gate on checked-in guide bundle when present', () => {
    const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')
    if (!existsSync(join(bundleRoot, 'manifest.json'))) return
    expect(() => assertClassModelGuideExecutableSchemas(bundleRoot)).not.toThrow()
  })

  it('passes semantic gaps zero gate when report has no gaps', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      writeFileSync(join(root, 'semantic-gaps.json'), JSON.stringify({
        gapCount: 0,
        gaps: [],
      }))

      expect(() => assertClassModelSemanticGapsZero(root)).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('passes semantic gaps gate when only member documentation debt exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      writeFileSync(join(root, 'semantic-gaps.json'), JSON.stringify({
        gapCount: 2,
        gaps: [
          {
            kind: 'attribute',
            className: 'Demo',
            memberName: 'name',
            sourceFile: 'packages/demo.ts',
          },
          {
            kind: 'method',
            className: 'Demo',
            memberName: 'run',
            sourceFile: 'packages/demo.ts',
          },
        ],
      }))

      expect(() => assertClassModelSemanticGapsZero(root)).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws semantic gaps gate when module/model/constructor gaps exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      writeFileSync(join(root, 'semantic-gaps.json'), JSON.stringify({
        gapCount: 2,
        gaps: [
          {
            kind: 'method',
            className: 'Demo',
            memberName: 'run',
            sourceFile: 'packages/demo.ts',
          },
          {
            kind: 'model',
            className: 'Demo',
            sourceFile: 'packages/demo.ts',
          },
        ],
      }))

      expect(() => assertClassModelSemanticGapsZero(root)).toThrow(/gateGapCount=1, totalGapCount=2/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
