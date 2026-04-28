#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(import.meta.dirname, '..')
const CONFIG_TIME_BUILD_DEP_PACKAGES = ['@spark-view/spark-utils']
const SUPPORTED_BUILD_MODES = new Set(['smart', 'classic'])

function resolveBuildMode() {
  const requested = (process.env['BUILD_MODE'] ?? 'smart').trim().toLowerCase()
  if (SUPPORTED_BUILD_MODES.has(requested)) {
    return requested
  }
  console.error(`❌ BUILD_MODE 不合法: "${requested}"，仅支持 smart 或 classic`)
  process.exit(1)
}

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}\n`)
  execSync(cmd, {
    stdio: 'inherit',
    cwd: ROOT_DIR,
    env: process.env,
    ...opts,
  })
}

function buildConfigTimeDependencies() {
  console.log('\n🔁 预构建配置期依赖...')
  for (const pkg of CONFIG_TIME_BUILD_DEP_PACKAGES) {
    run(`pnpm --filter ${pkg} run build`)
  }
  console.log('✅ 配置期依赖已同步')
}

const buildMode = resolveBuildMode()
buildConfigTimeDependencies()

console.log(`\n🧩 组件注册模式: ${buildMode}（构建模式与运行时注册路径强关联）`)
run('npx vite build', {
  env: {
    ...process.env,
    BUILD_MODE: buildMode,
  },
})
