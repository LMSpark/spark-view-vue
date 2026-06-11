import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

import {
  DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
  DTS_CLASS_MODEL_BUNDLE_VERSION,
  type DtsClassModelBundleManifest,
} from './dts-bundle-types'
import { projectDtsFileProjection } from './project-from-declarations'

export type BuildDtsClassModelBundleOptions = Readonly<{
  repoRoot: string
  rootFiles: readonly string[]
  outputDir: string
  exportedOnly?: boolean
}>

export type BuildDtsClassModelBundleResult = Readonly<{
  manifest: DtsClassModelBundleManifest
  manifestPath: string
  fileCount: number
  modelCount: number
}>

export function dtsSourcePathToBundleRelativeJson(sourcePath: string): string {
  return `files/${sourcePath}.json`
}

export function buildDtsClassModelBundle(
  options: BuildDtsClassModelBundleOptions,
): BuildDtsClassModelBundleResult {
  const repoRoot = resolve(options.repoRoot)
  const outputDir = resolve(options.outputDir)
  const files: Record<string, DtsClassModelBundleManifest['files'][string]> = {}
  const classIndex: Record<string, DtsClassModelBundleManifest['classIndex'][string]> = {}
  const duplicates: Array<{ className: string; keptFile: string; skippedFile: string }> = []
  let modelCount = 0

  for (const absolutePath of options.rootFiles) {
    const sourcePath = normalizeRepoPath(absolutePath, repoRoot)
    if (!sourcePath.startsWith('declarations/')) continue

    const projection = projectDtsFileProjection({
      repoRoot,
      absolutePath,
      exportedOnly: options.exportedOnly ?? false,
    })
    const bundleFile = dtsSourcePathToBundleRelativeJson(sourcePath)
    const outputPath = resolve(outputDir, bundleFile)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(projection, null, 2)}\n`, 'utf8')

    files[sourcePath] = { file: bundleFile.replace(/\\/g, '/') }
    modelCount += Object.keys(projection.models).length

    for (const className of projection.symbols) {
      const existing = classIndex[className]
      if (existing !== undefined) {
        duplicates.push({
          className,
          keptFile: existing.sourcePath,
          skippedFile: sourcePath,
        })
        continue
      }
      classIndex[className] = {
        sourcePath,
        file: bundleFile.replace(/\\/g, '/'),
      }
    }
  }

  const manifest: DtsClassModelBundleManifest = {
    schemaVersion: DTS_CLASS_MODEL_BUNDLE_VERSION,
    protocol: DTS_CLASS_MODEL_BUNDLE_PROTOCOL,
    generatedAt: new Date().toISOString(),
    scannedFileCount: Object.keys(files).length,
    files,
    classIndex,
    ...(duplicates.length === 0 ? {} : { duplicates }),
  }
  const manifestPath = resolve(outputDir, 'manifest.json')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  return {
    manifest,
    manifestPath,
    fileCount: Object.keys(files).length,
    modelCount,
  }
}

export function resolveDtsBundleRelativeUrl(manifestUrl: string, relativePath: string): string {
  return new URL(relativePath.replace(/\\/g, '/'), new URL(manifestUrl)).href
}

function normalizeRepoPath(absolutePath: string, repoRoot: string): string {
  return relative(resolve(repoRoot), resolve(absolutePath)).replace(/\\/g, '/')
}
