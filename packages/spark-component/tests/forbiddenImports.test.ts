import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

function walk(dir: string, files: string[] = []) {
  const entries = fs.readdirSync(dir)
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

describe('packages/spark-component: forbidden imports', () => {
  const root = path.resolve(__dirname, '..') // packages/spark-component
  const files = walk(root)
    .filter(f => /\.(ts|js|tsx|jsx|md|json)$/.test(f))

  const matches: Array<{ file: string; line: number; match: string }> = []

  const vueImportRegex = /import\s+[^'"\n]+from\s+['"][^'"]+\.vue['"]/g
  const requireVueRegex = /require\(['"][^'"]+\.vue['"]\)/g
  const featuresPathRegex = /from\s+['"][^'"]*features\//g

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (vueImportRegex.test(line) || requireVueRegex.test(line) || featuresPathRegex.test(line)) {
        const found = (line.match(vueImportRegex) ?? line.match(requireVueRegex) ?? line.match(featuresPathRegex))?.[0] ?? line
        matches.push({ file: path.relative(root, file), line: i + 1, match: found })
      }
    }
  }

  it('should not contain imports of .vue files or references to features/', () => {
    if (matches.length > 0) {
      const msg = matches.map(m => `${m.file}:${m.line} -> ${m.match}`).join('\n')
      throw new Error(`Found forbidden imports in packages/spark-component:\n${msg}`)
    }
    expect(matches.length).toBe(0)
  })
})
