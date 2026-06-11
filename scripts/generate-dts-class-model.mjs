#!/usr/bin/env node
// 一气呵成生成 DTS ClassModel 产物：
// 1. vue-tsc 生成 declarations 下的 .d.ts
// 2. 每个 .d.ts 生成一个同路径 .d.ts.json
// 3. 写入 generated/dts-class-model/manifest.json
// 4. 写入缺 JSDoc 语义补充日志 semantic-gaps.log / semantic-gaps.json

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDtsClassModelBundle } from '../packages/spark-ai/src/class-model/class-model/build-dts-class-model-bundle.ts'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const declarationsDir = resolve(repoRoot, 'declarations')
const outputDir = resolve(repoRoot, 'generated/dts-class-model')
const dtsManifestPath = resolve(outputDir, '.dts-manifest.json')
const skipDeclarations = process.argv.includes('--skip-declarations')
const deleteDeclarations = process.argv.includes('--delete-declarations')

if (!skipDeclarations) {
  console.log('Generating declarations...')
  run('pnpm', ['run', 'generate:declarations'])
} else {
  console.log('Skipping declaration generation.')
}

const dtsFiles = collectDeclarationFiles(declarationsDir)
if (dtsFiles.length === 0) {
  throw new Error('No .d.ts files found under declarations/.')
}
console.log(`Collected DTS files: ${String(dtsFiles.length)}`)

removeTreeSync(outputDir)
mkdirSync(outputDir, { recursive: true })
writeFileSync(dtsManifestPath, `${JSON.stringify(dtsFiles, null, 2)}\n`, 'utf8')

console.log('Building DTS ClassModel bundle...')
const result = buildDtsClassModelBundle({
  repoRoot,
  rootFiles: dtsFiles,
  outputDir,
  exportedOnly: false,
  progressInterval: 50,
  onProgress: event => {
    const line = renderProgress(event)
    if (line.length > 0) console.log(line)
  },
})

if (result.fileCount !== dtsFiles.length) {
  throw new Error(`DTS JSON count mismatch: dts=${String(dtsFiles.length)} json=${String(result.fileCount)}`)
}

console.log(`DTS files: ${String(dtsFiles.length)}`)
console.log(`Wrote ${relative(repoRoot, result.manifestPath)}`)
console.log(`Per-file JSON: ${String(result.fileCount)}`)
console.log(`ClassModel symbols (incl. duplicates in files): ${String(result.modelCount)}`)
console.log(`classIndex entries: ${String(Object.keys(result.manifest.classIndex).length)}`)
console.log(`Semantic gaps: ${String(result.semanticGapCount)}`)
console.log(`Semantic gap log: ${relative(repoRoot, result.semanticLogPath)}`)
console.log(`Semantic gap JSON: ${relative(repoRoot, result.semanticLogJsonPath)}`)
if (result.manifest.duplicates !== undefined && result.manifest.duplicates.length > 0) {
  console.log(`Duplicate className skipped in classIndex: ${String(result.manifest.duplicates.length)}`)
}

if (deleteDeclarations) {
  removeDeclarationsDir()
  console.log(`Deleted ${relative(repoRoot, declarationsDir)}`)
}

function run(command, args) {
  const child = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (child.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${String(child.status ?? 1)}`)
  }
}

function renderProgress(event) {
  if (event.phase === 'create-program') {
    return `Creating TypeScript Program for ${String(event.total ?? 0)} DTS file(s)...`
  }
  if (event.phase === 'program-ready') {
    return 'TypeScript Program ready.'
  }
  if (event.phase === 'project-file') {
    return `Projected DTS file ${String(event.current ?? 0)}/${String(event.total ?? 0)}: ${event.sourcePath ?? ''}`
  }
  if (event.phase === 'write-semantic-gaps') {
    return 'Writing semantic gap logs...'
  }
  if (event.phase === 'write-manifest') {
    return 'Writing bundle manifest...'
  }
  if (event.phase === 'done') {
    return 'DTS ClassModel bundle complete.'
  }
  return ''
}

function collectDeclarationFiles(rootDir) {
  if (!existsSync(rootDir)) {
    throw new Error(`Missing declarations dir: ${rootDir}`)
  }

  const files = []
  walk(rootDir, files)
  return files.sort((left, right) => left.localeCompare(right))
}

function walk(currentDir, files) {
  const entries = readdirSync(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = resolve(currentDir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }
}

function removeTreeSync(targetPath) {
  if (!existsSync(targetPath)) return
  rmSync(targetPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

function removeDeclarationsDir() {
  const expected = resolve(repoRoot, 'declarations')
  if (declarationsDir !== expected) {
    throw new Error(`Refusing to delete unexpected declarations dir: ${declarationsDir}`)
  }
  if (!existsSync(declarationsDir)) return
  removeTreeSync(declarationsDir)
}
