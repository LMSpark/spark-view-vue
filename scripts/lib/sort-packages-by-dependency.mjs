import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const PACKAGES_DIR_NAME = 'packages'

export function listPackageDirs(packagesDir) {
  return readdirSync(packagesDir).filter((dir) => (
    existsSync(join(packagesDir, dir, 'package.json'))
  ))
}

export function sortPackagesByDependency(pkgDirs, packagesDir) {
  const pkgMetas = pkgDirs.map((dir) => {
    const packageJsonPath = join(packagesDir, dir, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    return {
      dir,
      name: packageJson.name,
      deps: Object.keys(packageJson.dependencies ?? {}),
    }
  })

  const sorted = []
  const visited = new Set()

  function visit(meta) {
    if (visited.has(meta.name)) return
    visited.add(meta.name)
    for (const dep of meta.deps) {
      const depMeta = pkgMetas.find((candidate) => candidate.name === dep)
      if (depMeta) visit(depMeta)
    }
    sorted.push(meta.dir)
  }

  for (const meta of pkgMetas) visit(meta)
  return sorted
}

/**
 * @param {string} packagesDir absolute packages path
 * @param {string[] | null | undefined} onlyDirs optional package folder names (e.g. spark-utils)
 */
export function resolvePackagesInBuildOrder(packagesDir, onlyDirs) {
  const allDirs = listPackageDirs(packagesDir)
  const ordered = sortPackagesByDependency(allDirs, packagesDir)
  if (!onlyDirs || onlyDirs.length === 0) return ordered

  const selected = new Set(onlyDirs)
  const unknown = onlyDirs.filter((dir) => !allDirs.includes(dir))
  if (unknown.length > 0) {
    throw new Error(`Unknown package dir(s): ${unknown.join(', ')}`)
  }

  return ordered.filter((dir) => selected.has(dir))
}
