import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- Node .mjs helper has no declaration file
import { assertClassModelBundleComplete } from '../../scripts/lib/class-model-bundle-assert.mjs'

describe('class-model-bundle-assert', () => {
  it('throws when manifest shard file is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      writeFileSync(join(root, 'manifest.json'), JSON.stringify({
        files: {
          'class-model-emit/foo.d.ts': { file: 'files/missing.json' },
        },
      }))
      mkdirSync(join(root, 'runtime'), { recursive: true })
      writeFileSync(join(root, 'runtime/manifest.json'), '{}')

      expect(() => assertClassModelBundleComplete(root)).toThrow(/incomplete/i)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('passes when manifest shards and runtime manifest exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-class-model-assert-'))
    try {
      mkdirSync(join(root, 'files'), { recursive: true })
      mkdirSync(join(root, 'runtime'), { recursive: true })
      writeFileSync(join(root, 'files/foo.json'), '{}')
      writeFileSync(join(root, 'manifest.json'), JSON.stringify({
        files: {
          'class-model-emit/foo.d.ts': { file: 'files/foo.json' },
        },
      }))
      writeFileSync(join(root, 'runtime/manifest.json'), '{}')

      expect(() => assertClassModelBundleComplete(root)).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
