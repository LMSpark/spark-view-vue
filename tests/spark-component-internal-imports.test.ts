import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_ROOT = join(process.cwd(), 'packages', 'spark-component', 'src')

const REMOVED_ROOT_SHELL_IMPORT_PATTERNS = [
  "from '../types.js'",
  "from '../../types.js'",
  "from '../capabilities.js'",
  "from '../../capabilities.js'",
  "from '../capability-keys.js'",
  "from '../useSparkComponent.js'",
  "from '../../useSparkComponent.js'",
  "from '../internal-context.js'",
]

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectFiles(fullPath, acc)
      continue
    }
    if (fullPath.endsWith('.ts') || fullPath.endsWith('.vue')) {
      acc.push(fullPath)
    }
  }
  return acc
}

describe('spark-component internal imports', () => {
  it('does not let internal implementation depend on removed root shell paths', () => {
    const offenders: string[] = []

    for (const filePath of collectFiles(SRC_ROOT)) {
      const relPath = relative(SRC_ROOT, filePath).replaceAll('\\', '/')
      const content = readFileSync(filePath, 'utf8')
      const matched = REMOVED_ROOT_SHELL_IMPORT_PATTERNS.find(pattern => content.includes(pattern))
      if (matched) {
        offenders.push(`${relPath} -> ${matched}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
