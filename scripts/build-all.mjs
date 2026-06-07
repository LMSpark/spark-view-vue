#!/usr/bin/env node
/**
 * 完整构建脚本：
 *   1. 构建 Java 后端 JAR
 *   2. 构建 Vite 前端
 *
 * 用法：node scripts/build-all.mjs
 * 或：  pnpm run build（已配置）
 *
 * 标志：
 *   --skip-fe          跳过前端构建
 *
 * 环境变量（可选）：
 *   JAVA_HOME      — Java 17 路径（默认自动检测）
 *   SKIP_JAVA      — 设为 true 跳过 Java 构建（仅前端）
 *   SKIP_FE        — 设为 true 跳过前端构建
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadLocalJavaEnv } from './load-java-env.mjs'

const args = process.argv.slice(2)
const skipJava = process.env['SKIP_JAVA'] === 'true'
const skipFe = args.includes('--skip-fe') || process.env['SKIP_FE'] === 'true'

const ROOT_DIR = resolve(import.meta.dirname, '..')
const SERVER_DIR = resolve(ROOT_DIR, 'spark-ai-server')
const { loadedFiles, env: mergedEnv } = loadLocalJavaEnv(ROOT_DIR)
const existingPath = mergedEnv['PATH'] ?? mergedEnv['Path'] ?? process.env['PATH'] ?? process.env['Path'] ?? ''

// ── 检测 JAVA_HOME ──────────────────────────────────────────────────────────
const JAVA_HOME_CANDIDATES = [
  mergedEnv['JAVA_HOME'],
  'C:\\Program Files\\Microsoft\\jdk-17.0.16.8-hotspot',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
  'C:\\Program Files\\Java\\jdk-17',
]
const javaHome = JAVA_HOME_CANDIDATES.find(
  (p) => p && existsSync(resolve(p, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))
)

const mvnCmd = process.platform === 'win32' ? 'mvn.cmd' : 'mvn'
const javaEnv = javaHome
  ? {
      ...mergedEnv,
      JAVA_HOME: javaHome,
      PATH: resolve(javaHome, 'bin') + (process.platform === 'win32' ? ';' : ':') + existingPath,
    }
  : mergedEnv

function run(cmd, opts = {}) {
  console.log('\n> ' + cmd + '\n')
  execSync(cmd, { stdio: 'inherit', ...opts })
}

// ══════════════════════════════════════════════════════════════════════════════
//  主流程
// ══════════════════════════════════════════════════════════════════════════════

try {
  if (loadedFiles.length > 0) {
    console.log('📝 加载本地环境文件: ' + loadedFiles.join(', '))
  }

  // ── 1. Java 后端构建 ──────────────────────────────────────────────────────
  if (skipJava) {
    console.log('\n⏭️  跳过 Java 构建')
  } else {
    if (!javaHome) {
      console.error('❌ 找不到 Java 17，请设置 JAVA_HOME 环境变量（或设 SKIP_JAVA=true 跳过）')
      process.exit(1)
    }
    if (!existsSync(resolve(SERVER_DIR, 'pom.xml'))) {
      console.error('❌ 找不到 ' + SERVER_DIR + '/pom.xml')
      process.exit(1)
    }

    console.log('🔨 构建 Java 后端...')
    console.log('   JAVA_HOME: ' + javaHome)
    run(mvnCmd + ' package -DskipTests -q', { cwd: SERVER_DIR, env: javaEnv })
    console.log('✅ Java 后端构建完成')
  }

  // ── 2. Vite 前端构建 ──────────────────────────────────────────────────────
  if (skipFe) {
    console.log('\n⏭️  跳过前端构建')
  } else {
    console.log('\n🔨 构建 Vite 前端...')
    run('node scripts/build-frontend.mjs', { cwd: ROOT_DIR })
    console.log('✅ Vite 前端构建完成')
  }

  console.log('\n🎉 构建完成！')
  if (!skipJava) console.log('   Java JAR: spark-ai-server/target/*.jar')
  if (!skipFe) console.log('   前端产物:  dist/')

  process.exit(0)
} catch (err) {
  console.error('\n❌ 构建失败: ' + err.message)
  process.exit(1)
}
