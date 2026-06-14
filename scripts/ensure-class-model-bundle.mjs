#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import { assertClassModelBundleComplete } from './lib/class-model-bundle-assert.mjs'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const bundleRoot = resolve(repoRoot, 'generated/dts-class-model')
const manifestPath = resolve(bundleRoot, 'manifest.json')

if (!existsSync(manifestPath)) {
  const child = spawnSync('pnpm', ['run', 'generate:class-model-surface'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if ((child.status ?? 1) !== 0) {
    process.exit(child.status ?? 1)
  }
}

assertClassModelBundleComplete(bundleRoot)
