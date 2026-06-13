import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))

export const CLASS_MODEL_GENERATED_REL = 'generated/dts-class-model'
export const CLASS_MODEL_PUBLIC_REL = 'public/dts-class-model'
export const CLASS_MODEL_MANIFEST_PUBLIC_PATH = '/dts-class-model/manifest.json'

/**
 * 将 generated/dts-class-model 同步到 public/dts-class-model，供 Vite 静态发布。
 * 编译 SSOT 仍在 generated/；public/ 仅为运行时 fetch 镜像。
 */
export function syncClassModelStaticBundle(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? DEFAULT_REPO_ROOT)
  const sourceDir = resolve(repoRoot, CLASS_MODEL_GENERATED_REL)
  const targetDir = resolve(repoRoot, CLASS_MODEL_PUBLIC_REL)
  const manifestPath = resolve(sourceDir, 'manifest.json')

  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing ${CLASS_MODEL_GENERATED_REL}/manifest.json. Run pnpm run generate:class-model-surface first.`,
    )
  }

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(resolve(repoRoot, 'public'), { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true, force: true })

  return {
    repoRoot,
    sourceDir,
    targetDir,
    manifestPublicPath: CLASS_MODEL_MANIFEST_PUBLIC_PATH,
  }
}
