import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { buildDebugBreak } from './build-debug.mjs'

/**
 * Fail-fast：manifest 存在但 shard 缺失时抛错（generate 中断或拷贝前校验）。
 * 只校验 guide manifest（manifest.json + files/**）；不校验 runtime/manifest.json（已冻结，见 spark-ai-platform.md §3.4）。
 * 每个 method / constructor 必须带可执行的 paramsSchema（type: object），与 build-dts-class-model-bundle 编译契约一致。
 */
export function assertClassModelBundleComplete(bundleRoot, options = {}) {
  const root = resolve(bundleRoot)
  const manifestPath = join(root, 'manifest.json')
  buildDebugBreak('class-model-assert:start', { bundleRoot: root, manifestPath })
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

  buildDebugBreak('class-model-assert:shards-ok', {
    fileCount: Object.keys(manifest.files ?? {}).length,
  })

  if (options.requireParamsSchema === true) {
    assertGuideShardParamsSchema(root, manifest)
  }
}

/** guide shard 中每个 method / constructor 必须带可执行 paramsSchema；供 verify:class-model 在 generate 后调用。 */
export function assertClassModelGuideParamsSchema(bundleRoot) {
  const root = resolve(bundleRoot)
  const manifestPath = join(root, 'manifest.json')
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath}. Run pnpm run generate:class-model-surface before paramsSchema verification.`,
    )
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assertGuideShardParamsSchema(root, manifest)
}

/** CI 门禁：module/model/constructor 级 semantic-gaps 必须为 0（见 build-dts-class-model-bundle collectSemanticGaps）。 */
export function assertClassModelSemanticGapsZero(bundleRoot) {
  const root = resolve(bundleRoot)
  const semanticJsonPath = join(root, 'semantic-gaps.json')
  if (!existsSync(semanticJsonPath)) {
    throw new Error(
      `Missing ${semanticJsonPath}. Run pnpm run generate:class-model-surface before semantic gap verification.`,
    )
  }
  const report = JSON.parse(readFileSync(semanticJsonPath, 'utf8'))
  const gapCount = Number(report.gapCount ?? report.gaps?.length ?? 0)
  if (!Number.isFinite(gapCount) || gapCount > 0) {
    const samples = (report.gaps ?? []).slice(0, 10).map(gap => {
      const label = gap.memberName === undefined ? gap.className : `${gap.className}.${gap.memberName}`
      return `- [${gap.kind}] ${label} (${gap.sourceFile})`
    })
    throw new Error([
      `ClassModel semantic gaps must be zero for CI gate (gapCount=${String(gapCount)}).`,
      'Fix module/model/constructor JSDoc in source files, then run: pnpm run generate:class-model-surface',
      ...samples,
    ].join('\n'))
  }
}

function assertGuideShardParamsSchema(bundleRoot, manifest) {
  const violations = []
  for (const [sourcePath, entry] of Object.entries(manifest.files ?? {})) {
    const relativeFile = entry?.file
    if (typeof relativeFile !== 'string') continue
    const shardPath = join(bundleRoot, relativeFile)
    if (!existsSync(shardPath)) continue

    const shard = JSON.parse(readFileSync(shardPath, 'utf8'))
    const models = shard.models ?? {}
    for (const [className, model] of Object.entries(models)) {
      if (model === null || typeof model !== 'object') continue

      const constructorMeta = model.constructorMeta
      if (constructorMeta !== undefined && constructorMeta !== null && typeof constructorMeta === 'object') {
        if (!isExecutableParamsSchema(constructorMeta.paramsSchema)) {
          violations.push(`${sourcePath}#${className}.constructor`)
        }
      }

      for (const method of model.methods ?? []) {
        if (method === null || typeof method !== 'object') continue
        const methodName = typeof method.name === 'string' ? method.name : '<anonymous>'
        if (!isExecutableParamsSchema(method.paramsSchema)) {
          violations.push(`${sourcePath}#${className}.${methodName}`)
        }
      }
    }

    if (violations.length >= 10) break
  }

  if (violations.length > 0) {
    throw new Error([
      `ClassModel guide shard(s) missing executable paramsSchema (${String(violations.length)}+ violation(s)).`,
      'Regenerate with: pnpm run generate:class-model-surface',
      ...violations.slice(0, 10).map((item) => `- ${item}`),
    ].join('\n'))
  }
}

function isExecutableParamsSchema(value) {
  return value !== null
    && typeof value === 'object'
    && value.type === 'object'
    && typeof value.properties === 'object'
    && value.properties !== null
}
