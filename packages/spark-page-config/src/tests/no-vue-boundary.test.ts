import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const srcDir = join(currentDir, '..')

const FORBIDDEN_IMPORTS = [
  'vue',
  '@vue',
  'vue-router',
  '@spark-view/spark-app',
  '@spark-view/spark-component',
  '@/',
] as const

function* scanSourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (entry === 'tests' || entry === 'dist' || entry === 'node_modules') continue
      yield* scanSourceFiles(fullPath)
      continue
    }
    if (entry.endsWith('.ts')) yield fullPath
  }
}

function findForbiddenImports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf8')
  const matches: string[] = []
  const pattern = /\bfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const match of content.matchAll(pattern)) {
    const specifier = match[1] ?? match[2] ?? ''
    for (const importId of FORBIDDEN_IMPORTS) {
      if (
        specifier === importId
        || specifier.startsWith(`${importId}/`)
        || (importId.endsWith('/') && specifier.startsWith(importId))
      ) {
        matches.push(specifier)
      }
    }
  }
  return matches
}

describe('spark-page-config package boundary', () => {
  it('does not import Vue or app-layer packages', () => {
    const violations = Array.from(scanSourceFiles(srcDir))
      .flatMap((filePath) => {
        const imports = findForbiddenImports(filePath)
        return imports.map(importId => `${relative(srcDir, filePath)} -> ${importId}`)
      })

    expect(violations).toEqual([])
  })
})
