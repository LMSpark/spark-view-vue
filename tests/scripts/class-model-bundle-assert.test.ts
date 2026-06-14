import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
// @ts-ignore TS7016 -- Node .mjs helper；契约见 scripts/lib/class-model-bundle-assert.d.ts
import { assertClassModelBundleComplete, assertClassModelGuideParamsSchema, assertClassModelSemanticGapsZero } from '../../scripts/lib/class-model-bundle-assert.mjs'

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
            methods: [{
              name: 'run',
              paramsSchema: { type: 'object', properties: {} },
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

  it('throws when guide shard method is missing paramsSchema', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      mkdirSync(join(root, 'files'), { recursive: true })
      writeFileSync(join(root, 'files/foo.json'), JSON.stringify({
        models: {
          Demo: {
            methods: [{ name: 'run' }],
          },
        },
      }))
      writeFileSync(join(root, 'manifest.json'), JSON.stringify({
        files: {
          'class-model-emit/foo.d.ts': { file: 'files/foo.json' },
        },
      }))

      expect(() => assertClassModelGuideParamsSchema(root)).toThrow(/paramsSchema/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('passes paramsSchema gate on checked-in guide bundle when present', () => {
    const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')
    if (!existsSync(join(bundleRoot, 'manifest.json'))) return
    expect(() => assertClassModelGuideParamsSchema(bundleRoot)).not.toThrow()
  })

  it('passes semantic gaps zero gate on checked-in bundle when present', () => {
    const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')
    if (!existsSync(join(bundleRoot, 'semantic-gaps.json'))) return
    expect(() => assertClassModelSemanticGapsZero(bundleRoot)).not.toThrow()
  })
})
