import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import {
  augmentIncrementalPlanWithConfigDrift,
  canSkipDeclarationEmit,
  planIncrementalBundleBuild,
  readDtsManifestSnapshot,
  resolveEmitSourcePathsForIncrementalPlan,
  writeDtsManifestSnapshot,
} from '../../scripts/lib/class-model-incremental-build.mjs'
import { dtsSourcePathToBundleRelativeJson } from '../../packages/spark-ai/src/class-model/class-model/dts-bundle-url.ts'

describe('class-model-incremental-build', () => {
  it('treats legacy array .dts-manifest as full rebuild', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-manifest-legacy-'))
    try {
      writeFileSync(join(root, '.dts-manifest.json'), JSON.stringify(['a.d.ts']), 'utf8')
      expect(readDtsManifestSnapshot(join(root, '.dts-manifest.json'))).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('skips unchanged shards when source mtime matches snapshot', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-incremental-'))
    try {
      const repoRoot = root
      const outputDir = join(root, 'generated/dts-class-model')
      const sourcePath = 'class-model-emit/packages/demo/src/widget.d.ts'
      const sourceTs = join(repoRoot, 'packages/demo/src/widget.ts')
      const shardRelative = dtsSourcePathToBundleRelativeJson(sourcePath)
      const shardPath = join(outputDir, shardRelative)
      const mtime = new Date('2026-01-02T03:04:05.000Z')

      mkdirSync(join(repoRoot, 'packages/demo/src'), { recursive: true })
      writeFileSync(sourceTs, 'export class Widget {}\n', 'utf8')
      utimesSync(sourceTs, mtime, mtime)
      mkdirSync(join(outputDir, 'files/class-model-emit/packages/demo/src'), { recursive: true })
      writeFileSync(shardPath, JSON.stringify({
        symbols: ['Widget'],
        generatedAt: mtime.toISOString(),
      }), 'utf8')

      const existingManifest = {
        files: {
          [sourcePath]: {
            file: shardRelative,
            module: { sourceFile: 'packages/demo/src/widget.ts' },
          },
        },
      }
      const existingDtsManifest = {
        schemaVersion: 1,
        entries: {
          [sourcePath]: {
            sourceFile: 'packages/demo/src/widget.ts',
            sourceModifiedAt: mtime.toISOString(),
            shardFile: shardRelative,
          },
        },
      }

      const plan = planIncrementalBundleBuild({
        repoRoot,
        outputDir,
        emitSourcePaths: [sourcePath],
        dtsFiles: [resolve(repoRoot, sourcePath)],
        existingManifest,
        existingDtsManifest,
        resolveProgramRootFiles: () => [],
      })

      expect(plan.mode).toBe('incremental')
      expect([...plan.unchangedSourcePaths]).toEqual([sourcePath])
      expect(plan.changedSourcePaths.size).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks shard as changed when source mtime differs', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-incremental-changed-'))
    try {
      const repoRoot = root
      const outputDir = join(root, 'generated/dts-class-model')
      const sourcePath = 'class-model-emit/packages/demo/src/widget.d.ts'
      const sourceTs = join(repoRoot, 'packages/demo/src/widget.ts')
      const shardRelative = dtsSourcePathToBundleRelativeJson(sourcePath)
      const shardPath = join(outputDir, shardRelative)
      const oldMtime = new Date('2026-01-02T03:04:05.000Z')
      const newMtime = new Date('2026-01-03T03:04:05.000Z')

      mkdirSync(join(repoRoot, 'packages/demo/src'), { recursive: true })
      writeFileSync(sourceTs, 'export class Widget {}\n', 'utf8')
      utimesSync(sourceTs, newMtime, newMtime)
      mkdirSync(join(outputDir, 'files/class-model-emit/packages/demo/src'), { recursive: true })
      writeFileSync(shardPath, JSON.stringify({
        symbols: ['Widget'],
        generatedAt: oldMtime.toISOString(),
      }), 'utf8')

      const plan = planIncrementalBundleBuild({
        repoRoot,
        outputDir,
        emitSourcePaths: [sourcePath],
        dtsFiles: [resolve(repoRoot, sourcePath)],
        existingManifest: {
          files: {
            [sourcePath]: { file: shardRelative, module: { sourceFile: 'packages/demo/src/widget.ts' } },
          },
        },
        existingDtsManifest: {
          schemaVersion: 1,
          entries: {
            [sourcePath]: {
              sourceFile: 'packages/demo/src/widget.ts',
              sourceModifiedAt: oldMtime.toISOString(),
              shardFile: shardRelative,
            },
          },
        },
        resolveProgramRootFiles: changed => changed.map(path => resolve(repoRoot, path)),
      })

      expect(plan.mode).toBe('incremental')
      expect([...plan.changedSourcePaths]).toEqual([sourcePath])
      expect(plan.unchangedSourcePaths.size).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes source mtime entries into .dts-manifest.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-dts-manifest-write-'))
    try {
      const repoRoot = root
      const manifestPath = join(root, '.dts-manifest.json')
      const sourcePath = 'class-model-emit/packages/demo/src/widget.d.ts'
      const sourceTs = join(repoRoot, 'packages/demo/src/widget.ts')
      const mtime = new Date('2026-01-02T03:04:05.000Z')
      mkdirSync(join(repoRoot, 'packages/demo/src'), { recursive: true })
      writeFileSync(sourceTs, 'export class Widget {}\n', 'utf8')
      utimesSync(sourceTs, mtime, mtime)

      writeDtsManifestSnapshot({
        repoRoot,
        manifestPath,
        writeFileSync,
        manifest: {
          files: {
            [sourcePath]: {
              file: dtsSourcePathToBundleRelativeJson(sourcePath),
              module: { sourceFile: 'packages/demo/src/widget.ts' },
            },
          },
        },
      })

      const snapshot = JSON.parse(readFileSync(manifestPath, 'utf8'))
      expect(snapshot.schemaVersion).toBe(1)
      expect(snapshot.entries[sourcePath]).toMatchObject({
        sourceFile: 'packages/demo/src/widget.ts',
        sourceModifiedAt: mtime.toISOString(),
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('resolveEmitSourcePathsForIncrementalPlan prefers manifest keys when manifest exists', () => {
    expect(resolveEmitSourcePathsForIncrementalPlan({
      configEmitSourcePaths: [
        'class-model-emit/a.d.ts',
        'class-model-emit/b.d.ts',
        'class-model-emit/phantom.d.ts',
      ],
      existingManifest: {
        files: {
          'class-model-emit/a.d.ts': { file: 'files/a.json' },
          'class-model-emit/b.d.ts': { file: 'files/b.json' },
        },
      },
    })).toEqual([
      'class-model-emit/a.d.ts',
      'class-model-emit/b.d.ts',
    ])
  })

  it('augmentIncrementalPlanWithConfigDrift tracks config-only paths separately', () => {
    const plan = {
      mode: 'incremental',
      changedSourcePaths: new Set(),
      unchangedSourcePaths: new Set(['class-model-emit/a.d.ts']),
      removedSourcePaths: new Set(),
      programRootFiles: [],
    }
    const augmented = augmentIncrementalPlanWithConfigDrift(plan, {
      repoRoot: process.cwd(),
      configEmitSourcePaths: [
        'class-model-emit/a.d.ts',
        'class-model-emit/phantom.d.ts',
      ],
      existingManifest: {
        files: {
          'class-model-emit/a.d.ts': { file: 'files/a.json' },
        },
      },
      existingDtsManifest: { schemaVersion: 1, entries: {} },
      resolveProgramRootFiles: paths => paths,
    })
    expect(augmented.changedSourcePaths.size).toBe(0)
    expect([...augmented.newConfigSourcePaths ?? []]).toEqual([])
    expect(augmented.removedSourcePaths.size).toBe(0)
  })

  it('canSkipDeclarationEmit ignores newConfigSourcePaths', () => {
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(),
      removedSourcePaths: new Set(),
      newConfigSourcePaths: new Set(['class-model-emit/phantom.d.ts']),
    })).toBe(true)
  })

  it('canSkipDeclarationEmit is true only when manifest shards unchanged and none removed', () => {
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(),
      removedSourcePaths: new Set(),
    })).toBe(true)
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(['class-model-emit/a.d.ts']),
      removedSourcePaths: new Set(),
    })).toBe(false)
    expect(canSkipDeclarationEmit({
      mode: 'incremental',
      changedSourcePaths: new Set(),
      removedSourcePaths: new Set(['class-model-emit/b.d.ts']),
    })).toBe(false)
    expect(canSkipDeclarationEmit(undefined)).toBe(false)
  })
})
