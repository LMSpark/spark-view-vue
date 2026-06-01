#!/usr/bin/env node
/**
 * 上传组件元数据到 AI 服务端
 *
 * 在 `pnpm run generate:catalog`（或 `pnpm run build`）完成后执行，将
 * packages/spark-project-model/src/ai/page-design/payload/component-catalog.json
 * 上传到 Java 后端的 POST /api/ai/component-metadata 端点。
 *
 * 用法：
 *   node scripts/upload-component-metadata.mjs [--url <serverUrl>]
 *
 * 环境变量：
 *   AI_BACKEND_URL  — 后端地址（默认 http://localhost:8080）
 *
 * 示例：
 *   node scripts/upload-component-metadata.mjs
 *   node scripts/upload-component-metadata.mjs --url http://192.168.1.100:8080
 *   AI_BACKEND_URL=https://api.example.com node scripts/upload-component-metadata.mjs
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

// ── 参数解析 ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let url = process.env.AI_BACKEND_URL ?? 'http://localhost:8080'

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && i + 1 < args.length) {
      url = args[++i]
    }
  }

  return { url: url.replace(/\/+$/, '') }
}

// ── 主流程 ────────────────────────────────────────────────────────────────

async function main() {
  const { url } = parseArgs()
  const metadataPath = resolve(projectRoot, 'packages', 'spark-project-model', 'src', 'ai', 'page-design', 'payload', 'component-catalog.json')

  // 检查文件存在
  if (!existsSync(metadataPath)) {
    console.error('❌ 未找到 packages/spark-project-model/src/ai/page-design/payload/component-catalog.json')
    console.error('   请先执行 pnpm run generate:catalog 生成目录')
    process.exit(1)
  }

  const json = readFileSync(metadataPath, 'utf-8')

  // 验证 JSON 有效性
  let metadata
  try {
    metadata = JSON.parse(json)
  } catch {
    console.error('❌ component-catalog.json 不是有效 JSON')
    process.exit(1)
  }

  const endpoint = `${url}/api/ai/component-metadata`
  const componentCount = Number(metadata?.componentCount)
    || Object.keys(metadata?.components ?? {}).length

  console.log(`📦 组件元数据: ${componentCount} 个组件`)
  console.log(`📤 上传到: ${endpoint}`)

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error(`❌ 上传失败: HTTP ${resp.status}`)
      console.error(`   ${text}`)
      process.exit(1)
    }

    const result = await resp.json()
    console.log(`✅ 上传成功:`, result)

  } catch (err) {
    console.error(`❌ 网络错误: ${err.message}`)
    console.error(`   请确认 AI 后端 (${url}) 正在运行`)
    process.exit(1)
  }
}

main()
