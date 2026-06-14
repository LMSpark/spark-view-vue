import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Fail-fast：manifest 存在但 shard 缺失时抛错（generate 中断或拷贝前校验）。
 */
export function assertClassModelBundleComplete(bundleRoot) {
  const root = resolve(bundleRoot)
  const manifestPath = join(root, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath}. Run pnpm run generate:class-model-surface before build.`,
    )
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const missing = []
  for (const [sourcePath, entry] of Object.entries(manifest.files ?? {})) {
    const relativeFile = entry?.file
    if (typeof relativeFile !== 'string' || !existsSync(join(root, relativeFile))) {
      missing.push(sourcePath)
    }
    if (missing.length >= 10) break
  }
  if (missing.length > 0) {
    throw new Error([
      `ClassModel bundle is incomplete (${String(missing.length)}+ missing shard file(s)).`,
      'Run: pnpm run generate:class-model-surface',
      ...missing.slice(0, 10).map((sourcePath) => `- ${sourcePath}`),
    ].join('\n'))
  }

  const runtimeManifestPath = join(root, 'runtime/manifest.json')
  if (!existsSync(runtimeManifestPath)) {
    throw new Error(
      `Missing ${runtimeManifestPath}. Run pnpm run generate:class-model-surface before build.`,
    )
  }
}
