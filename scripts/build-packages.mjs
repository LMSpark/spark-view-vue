#!/usr/bin/env node

/**
 * 按 workspace 依赖顺序构建 packages/*（vite JS + tsc/vue-tsc 声明）。
 *
 * 用法：
 *   node scripts/build-packages.mjs
 *   node scripts/build-packages.mjs --only spark-utils,spark-data
 *   node scripts/build-packages.mjs --dry-run
 */

import { join } from 'node:path'
import process from 'node:process'
import { PACKAGES_DIR, ROOT_DIR, runCommand } from './build-shared.mjs'
import { resolvePackagesInBuildOrder } from './lib/sort-packages-by-dependency.mjs'

function parseOnlyArg(argv) {
  const onlyFlagIndex = argv.indexOf('--only')
  if (onlyFlagIndex >= 0) {
    const value = argv[onlyFlagIndex + 1]
    if (!value || value.startsWith('--')) {
      throw new Error('--only requires a comma-separated package dir list')
    }
    return value.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return null
}

function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const onlyDirs = parseOnlyArg(argv)
  const packages = resolvePackagesInBuildOrder(PACKAGES_DIR, onlyDirs)

  if (packages.length === 0) {
    console.log('No packages selected.')
    process.exit(0)
  }

  console.log(`📦 Package build order: ${packages.join(' → ')}`)
  if (dryRun) {
    process.exit(0)
  }

  for (const pkgDir of packages) {
    console.log(`\n🔧 Building ${pkgDir} ...`)
    runCommand('pnpm run build', { cwd: join(PACKAGES_DIR, pkgDir) })
  }

  console.log('\n✅ Package build complete.')
}

try {
  main()
} catch (error) {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
