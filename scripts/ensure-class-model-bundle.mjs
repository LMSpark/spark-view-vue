#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const manifestPath = resolve(repoRoot, 'generated/dts-class-model/manifest.json')

if (existsSync(manifestPath)) {
  process.exit(0)
}

const child = spawnSync('pnpm', ['run', 'generate:class-model-surface'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(child.status ?? 1)
