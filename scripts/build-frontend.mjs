#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(import.meta.dirname, '..')
const CONFIG_TIME_BUILD_DEP_PACKAGES = ['@spark-view/spark-utils']

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

buildConfigTimeDependencies()

console.log('\n🧩 组件注册模式: 编译时注册')
run('npx vite build')
