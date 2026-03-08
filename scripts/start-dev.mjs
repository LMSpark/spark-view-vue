#!/usr/bin/env node
/**
 * 开发启动脚本：先启动 Java 后端，等待其就绪后再启动 Vite 前端。
 *
 * 用法：node scripts/start-dev.mjs
 * 或：  pnpm run dev（已配置）
 *
 * 环境变量（可选）：
 *   JAVA_HOME          — Java 17 路径（默认自动检测）
 *   OPENAI_API_KEY     — LLM API Key
 *   OPENAI_BASE_URL    — LLM 端点（默认 https://api.deepseek.com）
 *   AI_MODEL           — 模型名称（默认 deepseek-chat）
 *   BACKEND_PORT       — 后端端口（默认 8080）
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import http from 'node:http'

const BACKEND_PORT = process.env['BACKEND_PORT'] || '8080'
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const SERVER_DIR = resolve(import.meta.dirname, '..', 'spark-ai-server')

// ── 检测 JAVA_HOME ──────────────────────────────────────────────────────────
const JAVA_HOME_CANDIDATES = [
  process.env['JAVA_HOME'],
  'C:\\Program Files\\Microsoft\\jdk-17.0.16.8-hotspot',
  'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
  'C:\\Program Files\\Java\\jdk-17',
]
const javaHome = JAVA_HOME_CANDIDATES.find(
  (p) => p && existsSync(resolve(p, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))
)
if (!javaHome) {
  console.error('❌ 找不到 Java 17，请设置 JAVA_HOME 环境变量')
  process.exit(1)
}

// ── 检查 pom.xml 存在 ───────────────────────────────────────────────────────
if (!existsSync(resolve(SERVER_DIR, 'pom.xml'))) {
  console.error(`❌ 找不到 ${SERVER_DIR}/pom.xml`)
  process.exit(1)
}

// ── 等待后端就绪 ─────────────────────────────────────────────────────────────
function waitForBackend(timeoutMs = 120_000) {
  const start = Date.now()
  return new Promise((resolveP, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Java 后端 ${timeoutMs / 1000}s 内未就绪`))
        return
      }
      const req = http.get(`${BACKEND_URL}/api/config/default`, { timeout: 2000 }, (res) => {
        if (res.statusCode === 200) {
          res.resume()
          resolveP()
        } else {
          res.resume()
          setTimeout(check, 1500)
        }
      })
      req.on('error', () => setTimeout(check, 1500))
    }
    check()
  })
}

// ── 启动 Java 后端 ──────────────────────────────────────────────────────────
console.log(`\n🚀 启动 Java 后端 (port ${BACKEND_PORT})...`)
console.log(`   JAVA_HOME: ${javaHome}`)
console.log(`   目录: ${SERVER_DIR}\n`)

const mvnCmd = process.platform === 'win32' ? 'mvn.cmd' : 'mvn'
const javaEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${resolve(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env['PATH']}`,
}

const backend = spawn(mvnCmd, ['spring-boot:run', `-Dserver.port=${BACKEND_PORT}`], {
  cwd: SERVER_DIR,
  env: javaEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
})

backend.stdout.on('data', (d) => process.stdout.write(`[java] ${d}`))
backend.stderr.on('data', (d) => process.stderr.write(`[java] ${d}`))
backend.on('error', (err) => {
  console.error(`❌ Java 启动失败: ${err.message}`)
  process.exit(1)
})
backend.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`❌ Java 进程退出 code=${code}`)
    process.exit(code)
  }
})

// ── 等后端就绪后启动 Vite ────────────────────────────────────────────────────
try {
  await waitForBackend()
} catch (e) {
  console.error(`\n❌ ${e.message}`)
  backend.kill()
  process.exit(1)
}

console.log(`\n✅ Java 后端就绪: ${BACKEND_URL}`)
console.log(`🚀 启动 Vite 前端...\n`)

const vite = spawn('npx', ['vite'], {
  cwd: resolve(import.meta.dirname, '..'),
  env: { ...process.env, AI_BACKEND_URL: BACKEND_URL },
  stdio: 'inherit',
  shell: true,
})

// ── 优雅退出：关闭两个进程 ──────────────────────────────────────────────────
function cleanup() {
  vite.kill()
  backend.kill()
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
vite.on('exit', () => { backend.kill(); process.exit(0) })
