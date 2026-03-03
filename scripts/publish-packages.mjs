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
 *
 * 注意：必须使用 `pnpm publish` 而非 `npm publish`。
 *   pnpm 会在打包时自动将 workspace:* 替换为实际版本号；
 *   npm publish 不具备此能力，会导致 workspace:* 原样写入 tarball，
 *   消费者安装时因无法解析 workspace: 协议而报错。
 */

import { execSync } from 'child_process'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../')
const PACKAGES_DIR = join(ROOT, 'packages')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const tagIdx = args.indexOf('--tag')
const TAG = tagIdx !== -1 ? args[tagIdx + 1] : 'latest'

const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' })

/**
 * 按依赖关系排序包，确保被依赖的包先发布。
 * 例如 spark-utils → spark-component → spark-app
 */
function sortPackagesByDependency(pkgDirs) {
  const pkgMetas = pkgDirs.map(dir => {
    const pkgJson = JSON.parse(readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf-8'))
    return { dir, name: pkgJson.name, deps: Object.keys(pkgJson.dependencies ?? {}) }
  })

  const sorted = []
  const visited = new Set()

  function visit(meta) {
    if (visited.has(meta.name)) return
    visited.add(meta.name)
    for (const dep of meta.deps) {
      const depMeta = pkgMetas.find(m => m.name === dep)
      if (depMeta) visit(depMeta)
    }
    sorted.push(meta.dir)
  }

  for (const meta of pkgMetas) visit(meta)
  return sorted
}

// 1. 构建所有包，按照依赖顺序串行构建
console.log('\n📦 构建所有子包...')
const allPackages = readdirSync(PACKAGES_DIR).filter(
  dir => existsSync(join(PACKAGES_DIR, dir, 'package.json'))
)
const packages = sortPackagesByDependency(allPackages)

console.log('\n📋 构建顺序:', packages.join(' → '))
for (const pkg of packages) {
  const pkgDir = join(PACKAGES_DIR, pkg)
  console.log(`\n🔧 构建 ${pkg} ...`)
  run('pnpm run build', pkgDir)
}

// 2. 按依赖顺序发布（被依赖包优先）

console.log('\n📋 发布顺序:', packages.join(' → '))

for (const pkg of packages) {
  const pkgDir = join(PACKAGES_DIR, pkg)
  const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'))
  const pkgName = pkgJson.name
  const pkgVersion = pkgJson.version

  if (DRY_RUN) {
    // dry-run 时用 pnpm pack 验证产物中 workspace:* 已被替换
    console.log(`\n[dry-run] 检查打包产物: ${pkg}`)
    run(`pnpm pack --dry-run`, pkgDir)
    continue
  }

  // 检查版本是否已在 npm 发布，若已发布则跳过
  let alreadyPublished = false
  try {
    const result = execSync(`npm view ${pkgName}@${pkgVersion} version`, { cwd: pkgDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (result === pkgVersion) alreadyPublished = true
  } catch (_) { /* 未发布 */ }

  if (alreadyPublished) {
    console.log(`\n⏭️  跳过 ${pkgName}@${pkgVersion}（已发布）`)
    continue
  }

  console.log(`\n🚀 发布 ${pkg} (${pkgVersion}) ...`)
  // 使用 pnpm publish：自动将 dependencies 中的 workspace:* 替换为实际解析版本
  // 显式指定 registry 避免走 npmmirror 镜像
  run(`pnpm publish --access public --tag ${TAG} --no-git-checks --registry https://registry.npmjs.org`, pkgDir)
}

console.log(DRY_RUN ? '\n✅ Dry-run 完成。' : '\n🎉 Done!')
