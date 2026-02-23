#!/usr/bin/env node
/**
 * publish-packages.mjs
 * 
 * 构建并发布所有 @spark-view/* 子包到私有 Verdaccio 注册表。
 * 
 * 用法：
 *   node scripts/publish-packages.mjs [--dry-run] [--registry <url>]
 * 
 * 选项：
 *   --dry-run     只构建，不实际发布（验证流程用）
 *   --registry    指定注册表地址（默认 http://localhost:4873）
 *   --tag <tag>   发布 tag（默认 latest）
 * 
 * 前置条件：
 *   已登录私有 registry：npm login --registry http://localhost:4873
 */

import { execSync } from 'child_process'
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── 参数解析 ──────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const REGISTRY = args.includes('--registry')
  ? args[args.indexOf('--registry') + 1]
  : 'https://registry.npmjs.org'
const TAG = args.includes('--tag')
  ? args[args.indexOf('--tag') + 1]
  : 'latest'

// ── 顺序：被依赖的包先发布 ───────────────────────────────
const PUBLISH_ORDER = [
  'spark-utils',
  'spark-data',
  'spark-app',
  'spark-page-config',
  'spark-component',
]

function run(cmd, cwd = ROOT) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function getPackageJson(pkgDir) {
  const p = join(pkgDir, 'package.json')
  const content = readFileSync(p, 'utf-8').replace(/^\uFEFF/, '') // strip BOM
  return JSON.parse(content)
}

// ── 主流程 ────────────────────────────────────────────────
console.log('='.repeat(60))
console.log(`SPARK-VIEW Package Publisher`)
console.log(`Registry : ${REGISTRY}`)
console.log(`Tag      : ${TAG}`)
console.log(`Dry run  : ${DRY_RUN}`)
console.log('='.repeat(60))

// 1. 构建所有子包
console.log('\n[1/2] Building packages...\n')
run('pnpm --filter "@spark-view/*" run build')

// 2. 逐包发布
console.log('\n[2/2] Publishing packages...\n')
for (const pkgName of PUBLISH_ORDER) {
  const pkgDir = join(ROOT, 'packages', pkgName)
  if (!existsSync(pkgDir)) {
    console.warn(`⚠  Skip: packages/${pkgName} not found`)
    continue
  }

  const pkg = getPackageJson(pkgDir)
  if (pkg.private === true) {
    console.log(`⏭  Skip: ${pkg.name} (private=true)`)
    continue
  }

  console.log(`\n📦  ${pkg.name}@${pkg.version}`)

  if (DRY_RUN) {
    console.log('   [dry-run] would publish:', pkg.name)
    run(`npm pack --dry-run`, pkgDir)
    continue
  }

  run(
    `pnpm publish --registry ${REGISTRY} --tag ${TAG} --no-git-checks --ignore-scripts`,
    pkgDir,
  )
  console.log(`✅  Published ${pkg.name}@${pkg.version}`)
}

console.log('\n🎉  Done!')
