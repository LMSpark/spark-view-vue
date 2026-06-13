#!/usr/bin/env node

/**
 * 前端生产构建：根 Vite 应用（monorepo 包通过 vite alias 指向 src，无需预构建 dist）。
 *
 * ClassModel 编译 SSOT：generated/dts-class-model/（已入库）。
 * 发布前 ensure 会同步到 public/dts-class-model/ 供 Worker fetch。
 */

import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { ROOT_DIR, runCommand } from './build-shared.mjs'

function ensureClassModelBundle() {
  const result = spawnSync(process.execPath, ['scripts/ensure-class-model-bundle.mjs'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

ensureClassModelBundle()
// ensure 已含 generated → public 同步

console.log('\n🧩 组件注册模式: 编译时注册（packages 走 Vite alias → src）')
runCommand('pnpm exec vite build', { cwd: ROOT_DIR })
