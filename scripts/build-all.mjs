#!/usr/bin/env node
/**
 * 完整构建脚本：
 *   1. 构建 Java 后端 JAR
 *   2. 启动 Java 后端（等待就绪）
 *   3. 构建 Vite 前端（生成组件元数据）
 *   4. 上传组件元数据到后端
 *   5. 关闭 Java 后端
 *
 * 用法：node scripts/build-all.mjs
 * 或：  pnpm run build（已配置）
 *
 * 标志：
 *   --skip-fe          跳过前端构建
 *   --no-upload        构建后不上传组件元数据（也不启动 Java）
 *
 * 环境变量（可选）：
 *   JAVA_HOME      — Java 17 路径（默认自动检测）
 *   BUILD_MODE     — Vite 构建模式（默认 smart）
 *   SKIP_JAVA      — 设为 true 跳过 Java 构建（仅前端）
 *   SKIP_FE        — 设为 true 跳过前端构建
 *   BACKEND_PORT   — 后端端口（默认 8080）
 */

import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import http from 'node:http'
import { loadLocalJavaEnv } from './load-java-env.mjs'

const args = process.argv.slice(2)
const skipJava = process.env['SKIP_JAVA'] === 'true'
const skipFe = args.includes('--skip-fe') || process.env['SKIP_FE'] === 'true'
const noUpload = args.includes('--no-upload')
const BACKEND_PORT = process.env['BACKEND_PORT'] || '8080'
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`

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
      PATH: `${resolve(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${existingPath}`,
    }
  : mergedEnv

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}\n`)
  execSync(cmd, { stdio: 'inherit', ...opts })
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

// ── 上传组件元数据 ──────────────────────────────────────────────────────────
async function uploadMetadata() {
  const metadataPath = resolve(ROOT_DIR, 'dist', 'spark-component-metadata.json')
  if (!existsSync(metadataPath)) {
    console.warn('⚠️  未找到 dist/spark-component-metadata.json，跳过上传')
    return
  }

  const json = readFileSync(metadataPath, 'utf-8')
  let metadata
  try {
    metadata = JSON.parse(json)
  } catch {
    console.warn('⚠️  spark-component-metadata.json 不是有效 JSON，跳过上传')
    return
  }

  const endpoint = `${BACKEND_URL}/api/ai/component-metadata`
  console.log(`\n📦 组件元数据: ${metadata.componentCount} 个组件, ${metadata.skillCount} 个 Skill`)
  console.log(`📤 上传到: ${endpoint}`)

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  })

  if (!resp.ok) {
    const text = await resp.text()
    console.error(`❌ 上传失败: HTTP ${resp.status} — ${text}`)
    process.exit(1)
  }

  const result = await resp.json()
  console.log(`✅ 元数据上传成功:`, result)
}

let backendProcess = null

function killBackend() {
  if (backendProcess && !backendProcess.killed) {
    const pid = backendProcess.pid
    backendProcess = null
    if (pid) {
      try {
        // Windows: 需要 /T 杀掉整个进程树（cmd → mvn → java）
        if (process.platform === 'win32') {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
        } else {
          process.kill(-pid, 'SIGTERM')
        }
      } catch {
        // 进程可能已退出，忽略
      }
    }
  }
}
process.on('SIGINT', () => { killBackend(); process.exit(1) })
process.on('SIGTERM', () => { killBackend(); process.exit(1) })

// ══════════════════════════════════════════════════════════════════════════════
//  主流程
// ══════════════════════════════════════════════════════════════════════════════

try {
  if (loadedFiles.length > 0) {
    console.log(`📝 加载本地环境文件: ${loadedFiles.join(', ')}`)
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
      console.error(`❌ 找不到 ${SERVER_DIR}/pom.xml`)
      process.exit(1)
    }

    console.log('🔨 构建 Java 后端...')
    console.log(`   JAVA_HOME: ${javaHome}`)
    run(`${mvnCmd} package -DskipTests -q`, { cwd: SERVER_DIR, env: javaEnv })
    console.log('✅ Java 后端构建完成')
  }

  // ── 2. 启动 Java 后端（用于接收元数据上传） ───────────────────────────────
  const needBackend = !noUpload && !skipFe
  if (needBackend) {
    if (!javaHome) {
      console.error('❌ 找不到 Java 17，无法启动后端上传元数据（可加 --no-upload 跳过）')
      process.exit(1)
    }

    console.log(`\n🚀 启动 Java 后端 (port ${BACKEND_PORT})...`)
    backendProcess = spawn(mvnCmd, ['spring-boot:run', `-Dserver.port=${BACKEND_PORT}`], {
      cwd: SERVER_DIR,
      env: javaEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    })
    backendProcess.stdout.on('data', (d) => process.stdout.write(`[java] ${d}`))
    backendProcess.stderr.on('data', (d) => process.stderr.write(`[java] ${d}`))
    backendProcess.on('error', (err) => {
      console.error(`❌ Java 启动失败: ${err.message}`)
      process.exit(1)
    })

    await waitForBackend()
    console.log(`✅ Java 后端就绪: ${BACKEND_URL}`)
  }

  // ── 3. Vite 前端构建 ──────────────────────────────────────────────────────
  if (skipFe) {
    console.log('\n⏭️  跳过前端构建')
  } else {
    console.log('\n🔨 构建 Vite 前端...')
    const buildMode = process.env['BUILD_MODE'] || 'smart'
    run(`npx cross-env BUILD_MODE=${buildMode} vite build`, { cwd: ROOT_DIR })
    console.log('✅ Vite 前端构建完成')
  }

  // ── 4. 上传组件元数据 ─────────────────────────────────────────────────────
  if (needBackend) {
    await uploadMetadata()
  }

  // ── 5. 关闭 Java 后端 ─────────────────────────────────────────────────────
  killBackend()

  console.log('\n🎉 构建完成！')
  if (!skipJava) console.log(`   Java JAR: spark-ai-server/target/*.jar`)
  if (!skipFe) console.log(`   前端产物:  dist/`)
  if (needBackend) console.log(`   元数据:    已上传到后端`)

  process.exit(0)

} catch (err) {
  killBackend()
  console.error(`\n❌ 构建失败: ${err.message}`)
  process.exit(1)
}
