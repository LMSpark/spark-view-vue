#!/usr/bin/env node
/**
 * 用 TypeScript 编译器 emitDeclarationOnly 生成 VCM target 的 .d.ts。
 *
 * tsconfig：config/vcm/tsconfig.<target-id>.json（include 对齐 registry.source.files 入口）
 * 输出：generated/vcm/<target-id>/tsc-declarations/**（保留源码目录结构 + 依赖闭包）
 *
 * 用法：
 *   pnpm run generate:vcm-declarations
 *   node --import tsx scripts/generate-vcm-declarations.mjs --target project-page-surface
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { findVcmMetadataTarget, readVcmMetadataConfig } from '../packages/vite-plugin-spark-catalog/src/vcm-config.ts'

const root = resolve(import.meta.dirname, '..')
const targetId = readCliOption('--target') ?? 'project-page-surface'
const target = findVcmMetadataTarget(readVcmMetadataConfig(root), targetId)

const tsconfigPath = resolve(root, 'config/vcm', `tsconfig.${targetId}.json`)
if (!existsSync(tsconfigPath)) {
  throw new Error(`Missing VCM tsc config: ${tsconfigPath}`)
}

const child = spawnSync('pnpm', ['exec', 'tsc', '-p', tsconfigPath, '--pretty', 'false'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
})

if (child.stdout) process.stdout.write(child.stdout)
if (child.stderr) process.stderr.write(child.stderr)
if (child.status !== 0) {
  process.exit(child.status ?? 1)
}

const distDir = resolve(root, target.outputs.distDir?.trim() || resolve(root, target.outputs.runtime, '..'))
const outDir = resolve(distDir, 'tsc-declarations')
const declarationFiles = listDeclarationFiles(outDir)
  .map(path => relative(root, path).replace(/\\/g, '/'))
const entryDeclarations = target.source.files.map(source =>
  declarationPathForSource(outDir, root, source),
).filter(path => existsSync(path)).map(path => relative(root, path).replace(/\\/g, '/'))

console.log(JSON.stringify({
  targetId,
  tsconfig: relative(root, tsconfigPath).replace(/\\/g, '/'),
  outDir: relative(root, outDir).replace(/\\/g, '/'),
  registryEntryFiles: target.source.files,
  entryDeclarations,
  declarationFileCount: declarationFiles.length,
}, null, 2))

function declarationPathForSource(outDir, repoRoot, sourceFile) {
  const normalized = sourceFile.replace(/\\/g, '/').replace(/\.ts$/u, '.d.ts')
  return resolve(outDir, normalized)
}

function listDeclarationFiles(dir) {
  if (!existsSync(dir)) return []
  const result = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      result.push(...listDeclarationFiles(path))
      continue
    }
    if (name.endsWith('.d.ts')) result.push(path)
  }
  return result.sort()
}

function readCliOption(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
