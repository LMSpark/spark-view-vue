import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LEGACY_PROTOCOL_TOOL_PATTERN = /\b(?:module_query|module_guide|module_attribute_guide|module_function_guide|module_find|module_attr|module_call|module_script|module_memory)\b|PROTOCOL_TOOL_NAMES/u

/** 禁令句等刻意保留旧名引用的生产文件 */
const ALLOWLIST = new Set([
  'packages/spark-ai/src/agent/business/vcm-native-agent-adapter.ts',
  'packages/spark-ai/ARCHITECTURE.md',
])

const SCAN_ROOTS = [
  'packages/spark-ai/src',
  'packages/spark-project-model/src',
  'src/services',
  '.cursor/rules',
  '.github',
]

function collectSourceFiles(rootDir: string, relativeRoot: string): string[] {
  const entries = readdirSync(rootDir)
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = join(rootDir, entry)
    const relativePath = join(relativeRoot, entry).replace(/\\/gu, '/')
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue
      files.push(...collectSourceFiles(absolutePath, relativePath))
      continue
    }

    if (/\.(?:ts|tsx|mdc|md)$/u.test(entry)) {
      if (/\.test\.(?:ts|tsx)$/u.test(entry) || relativePath.includes('/__tests__/')) {
        continue
      }
      files.push(relativePath)
    }
  }

  return files
}

function findLegacyProtocolMatches(repoRoot: string): Array<{ file: string, matches: string[] }> {
  const violations: Array<{ file: string, matches: string[] }> = []

  for (const scanRoot of SCAN_ROOTS) {
    const absoluteRoot = join(repoRoot, scanRoot)
    for (const file of collectSourceFiles(absoluteRoot, scanRoot)) {
      if (ALLOWLIST.has(file)) continue

      const text = readFileSync(join(repoRoot, file), 'utf8')
      const matches = [...new Set(text.match(new RegExp(LEGACY_PROTOCOL_TOOL_PATTERN.source, 'gu')) ?? [])]
      if (matches.length > 0) {
        violations.push({ file, matches })
      }
    }
  }

  return violations
}

describe('legacy protocol tool names', () => {
  it('has no LLM-visible module_* tool literals outside allowlist', () => {
    const repoRoot = process.cwd()
    const violations = findLegacyProtocolMatches(repoRoot)

    expect(violations).toEqual([])
  })
})
