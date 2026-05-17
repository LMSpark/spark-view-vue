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

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import http from 'node:http'
import net from 'node:net'
import { loadLocalJavaEnv } from './load-java-env.mjs'

const BACKEND_PORT = process.env['BACKEND_PORT'] || '8080'
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`
const ROOT_DIR = resolve(import.meta.dirname, '..')
const SERVER_DIR = resolve(ROOT_DIR, 'spark-ai-server')
const COMPOSE_FILE = resolve(SERVER_DIR, 'docker-compose.yml')
const VITE_CLI = resolve(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js')
const { loadedFiles, env: mergedEnv } = loadLocalJavaEnv(ROOT_DIR)
const existingPath = mergedEnv['PATH'] ?? mergedEnv['Path'] ?? process.env['PATH'] ?? process.env['Path'] ?? ''

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

if (!existsSync(VITE_CLI)) {
  console.error(`❌ 找不到本地 Vite CLI: ${VITE_CLI}`)
  console.error('   请先执行 `pnpm install` 后重试。')
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

function probeBackend(url, timeoutMs = 3000) {
  return new Promise((resolveP) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const ok = res.statusCode === 200
      res.resume()
      resolveP(ok)
    })
    req.on('error', () => resolveP(false))
    req.on('timeout', () => {
      req.destroy()
      resolveP(false)
    })
  })
}

function canConnectPort(host, port, timeoutMs = 400) {
  return new Promise((resolveP) => {
    const socket = new net.Socket()
    let settled = false

    const done = (value) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolveP(value)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, host)
  })
}

function isPortAvailable(port) {
  return new Promise(async (resolveP) => {
    // 先连接探测：若 localhost 已可连接，视为端口已占用。
    const inUseByIpv4 = await canConnectPort('127.0.0.1', port)
    const inUseByIpv6 = await canConnectPort('::1', port)
    if (inUseByIpv4 || inUseByIpv6) {
      resolveP(false)
      return
    }

    // 再绑定验证：避免仅靠 connect 导致误判。
    const server = net.createServer()
    server.once('error', () => resolveP(false))
    server.once('listening', () => {
      server.close(() => resolveP(true))
    })
    server.listen(port)
  })
}

async function findAvailablePort(startPort, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = startPort + i
    if (await isPortAvailable(candidate)) {
      return candidate
    }
  }
  throw new Error(`未找到可用前端端口，起始端口=${startPort}`)
}

function ensureMysqlService() {
  console.log('\n🐬 确保 Docker MySQL 已启动: 127.0.0.1:3307/spark_ai')
  const result = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', 'mysql'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) {
    console.error(`❌ Docker MySQL 启动失败: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`❌ Docker MySQL 启动失败，退出码=${result.status}`)
    process.exit(result.status ?? 1)
  }
}

// ── 启动 Java 后端 ──────────────────────────────────────────────────────────
console.log(`\n🚀 启动 Java 后端 (port ${BACKEND_PORT})...`)
console.log(`   JAVA_HOME: ${javaHome}`)
console.log(`   目录: ${SERVER_DIR}\n`)
if (loadedFiles.length > 0) {
  console.log(`   本地环境文件: ${loadedFiles.join(', ')}`)
}

const backendPortNumber = Number(BACKEND_PORT)
if (!Number.isInteger(backendPortNumber) || backendPortNumber <= 0 || backendPortNumber > 65535) {
  console.error(`❌ BACKEND_PORT 非法: ${BACKEND_PORT}`)
  process.exit(1)
}

const portAvailable = await isPortAvailable(backendPortNumber)
const backendProbeUrl = `${BACKEND_URL}/api/config/default`
const canReuseExistingBackend = !portAvailable && await probeBackend(backendProbeUrl)

if (!portAvailable && !canReuseExistingBackend) {
  console.error(`\n❌ 端口 ${BACKEND_PORT} 已被占用，且现有进程不是可用 SPARK 后端（${backendProbeUrl} 不可达）`)
  console.error('   请先释放端口，或设置 BACKEND_PORT 为其他端口后重试。')
  process.exit(1)
}

const mvnCmd = process.platform === 'win32' ? 'mvn.cmd' : 'mvn'
const javaEnv = {
  ...mergedEnv,
  JAVA_HOME: javaHome,
  PATH: `${resolve(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${existingPath}`,
}

let backend = null
if (canReuseExistingBackend) {
  console.warn(`⚠️ 检测到 ${BACKEND_URL} 已有可用后端，将复用现有进程，不重复拉起 Java。`)
} else {
  ensureMysqlService()
  backend = spawn(mvnCmd, ['spring-boot:run', `-Dserver.port=${BACKEND_PORT}`], {
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
}

// ── 等后端就绪后启动 Vite ────────────────────────────────────────────────────
try {
  if (!canReuseExistingBackend) {
    await waitForBackend()
  }
} catch (e) {
  console.error(`\n❌ ${e.message}`)
  backend?.kill()
  process.exit(1)
}

console.log(`\n✅ Java 后端就绪: ${BACKEND_URL}`)
console.log(`🚀 启动 Vite 前端...\n`)

const DEFAULT_FE_PORT = 5173
const vitePort = await findAvailablePort(DEFAULT_FE_PORT)
if (vitePort !== DEFAULT_FE_PORT) {
  console.warn(`⚠️ 端口 ${DEFAULT_FE_PORT} 已占用，Vite 将使用端口 ${vitePort}`)
}

const vite = spawn(process.execPath, [VITE_CLI, '--port', String(vitePort)], {
  cwd: ROOT_DIR,
  env: { ...mergedEnv, AI_BACKEND_URL: BACKEND_URL },
  stdio: 'inherit',
})

// ── 优雅退出：关闭两个进程 ──────────────────────────────────────────────────
function cleanup() {
  vite.kill()
  backend?.kill()
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
vite.on('exit', (code, signal) => {
  if (code === 0 || signal) {
    backend?.kill()
    process.exit(code ?? 0)
    return
  }

  console.error(`❌ Vite 异常退出（code=${code ?? 'unknown'}），保留 Java 后端运行: ${BACKEND_URL}`)
  console.error('   可手动执行 `pnpm run dev:fe -- --port <port>` 重新启动前端')
})
