import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const WORKSPACE_ROOT = process.cwd()

const REMOVED_SUBPATH_IMPORT_PATTERNS = [
  /(?:import|export)\s+[\s\S]*?from\s*['"]@spark-view\/spark-component\/(?:types|capabilities|capability-keys|useSparkComponent|internal-context|renderer)['"]/g,
  /import\s*['"]@spark-view\/spark-component\/(?:types|capabilities|capability-keys|useSparkComponent|internal-context|renderer)['"]/g,
  /(?:import|export)\s+[\s\S]*?from\s*['"][^'"]*spark-component\/src\/(?:types|capabilities|capability-keys|useSparkComponent|internal-context|renderer)(?:\.js)?['"]/g,
  /import\s*['"][^'"]*spark-component\/src\/(?:types|capabilities|capability-keys|useSparkComponent|internal-context|renderer)(?:\.js)?['"]/g,
]

function collectWorkspaceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') {
        continue
      }
      collectWorkspaceFiles(fullPath, acc)
      continue
    }

    if (
      fullPath.endsWith('.ts')
      || fullPath.endsWith('.tsx')
      || fullPath.endsWith('.js')
      || fullPath.endsWith('.vue')
    ) {
      acc.push(fullPath)
    }
  }

  return acc
}

describe('spark-component legacy subpaths', () => {
  it('does not let workspace code import removed spark-component subpaths', () => {
    const offenders: string[] = []

    for (const filePath of collectWorkspaceFiles(WORKSPACE_ROOT)) {
      const relPath = relative(WORKSPACE_ROOT, filePath).replaceAll('\\', '/')
      const content = readFileSync(filePath, 'utf8')
      const matched = REMOVED_SUBPATH_IMPORT_PATTERNS.find(pattern => {
        pattern.lastIndex = 0
        return pattern.test(content)
      })
      if (matched) {
        offenders.push(`${relPath} -> ${matched.source}`)
      }
    }

    expect(offenders).toEqual([])
  })
})