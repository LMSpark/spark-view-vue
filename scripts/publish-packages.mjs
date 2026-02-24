#!/usr/bin/env node
/**
 * publish-packages.mjs
 *
 * 构建并发布所有 @spark-view/* 子包到 npm。
 *
 * 用法：
 *   node scripts/publish-packages.mjs [--dry-run] [--tag <tag>]
 *
 * 选项：
 *   --dry-run     只构建，不实际发布
 *   --tag <tag>   发布 tag（默认 latest）
 */

import { execSync } from 'child_process'
import { readdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../')
const PACKAGES_DIR = join(ROOT, 'packages')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const tagIdx = args.indexOf('--tag')
const TAG = tagIdx !== -1 ? args[tagIdx + 1] : 'latest'

const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' })

// 1. 构建所有包
console.log('\n📦 构建所有子包...')
run('pnpm --filter "./packages/**" run build')

// 2. 逐包发布
const packages = readdirSync(PACKAGES_DIR).filter(
  dir => existsSync(join(PACKAGES_DIR, dir, 'package.json'))
)

for (const pkg of packages) {
  const pkgDir = join(PACKAGES_DIR, pkg)
  if (DRY_RUN) {
    console.log(`\n[dry-run] 跳过发布: ${pkg}`)
    continue
  }
  console.log(`\n🚀 发布 ${pkg} ...`)
  run(`npm publish --access public --tag ${TAG}`, pkgDir)
}

console.log(DRY_RUN ? '\n✅ Dry-run 完成。' : '\n🎉 Done!')
