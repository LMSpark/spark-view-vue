import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupLegacyCatalogOutputs,
  getCanonicalCatalogOutputPath,
} from '../json-catalog-generator'

const tempDirs: string[] = []

function makeTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spark-catalog-guard-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir === undefined) continue
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('catalog output guard', () => {
  it('resolves the canonical catalog output path under spark-ai/src/catalog', () => {
    const root = makeTempRoot()

    expect(getCanonicalCatalogOutputPath(root)).toBe(
      resolve(root, 'packages/spark-ai/src/catalog/component-catalog.json'),
    )
  })

  it('removes the exact legacy catalog file next to the canonical output', () => {
    const root = makeTempRoot()
    const canonicalPath = getCanonicalCatalogOutputPath(root)
    const catalogDir = resolve(root, 'packages/spark-ai/src/catalog')
    mkdirSync(catalogDir, { recursive: true })

    const legacyPath = resolve(catalogDir, 'component-catalog.ai.json')
    writeFileSync(legacyPath, '{"stale":true}', 'utf-8')

    cleanupLegacyCatalogOutputs(canonicalPath)

    expect(existsSync(legacyPath)).toBe(false)
  })

  it('does not delete similarly named files outside the canonical catalog directory', () => {
    const root = makeTempRoot()
    const canonicalPath = getCanonicalCatalogOutputPath(root)
    const catalogDir = resolve(root, 'packages/spark-ai/src/catalog')
    const siblingDir = resolve(root, 'packages/spark-ai/src')
    mkdirSync(catalogDir, { recursive: true })
    mkdirSync(siblingDir, { recursive: true })

    const legacyPath = resolve(catalogDir, 'component-catalog.ai.json')
    const siblingLegacyPath = resolve(siblingDir, 'component-catalog.ai.json')
    writeFileSync(legacyPath, '{"stale":true}', 'utf-8')
    writeFileSync(siblingLegacyPath, '{"keep":true}', 'utf-8')

    cleanupLegacyCatalogOutputs(canonicalPath)

    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(siblingLegacyPath)).toBe(true)
  })
})