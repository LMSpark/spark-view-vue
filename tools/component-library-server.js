#!/usr/bin/env node

/**
 * 组件库服务端API
 *
 * 提供组件库上传、查询和管理功能
 * 支持AI通过MCP协议查询组件信息
 */

import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 简单内存限速（防止 POST 写文件接口被滥用）
const _rateLimitMap = new Map()
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.ip
    const now = Date.now()
    const entry = _rateLimitMap.get(key) ?? { count: 0, start: now }
    if (now - entry.start > windowMs) {
      entry.count = 1; entry.start = now
    } else {
      entry.count++
    }
    _rateLimitMap.set(key, entry)
    if (entry.count > maxRequests) {
      return res.status(429).json({ success: false, error: '请求过于频繁，请稍后再试' })
    }
    next()
  }
}

// 服务端持久化数据文件（区别于 Vite 插件生成的 component-library.json 客户端目录）
let componentLibrary = {}
const SERVER_DATA_FILE = path.join(__dirname, '..', 'component-library-server.json')

// 加载已有的组件库
try {
  if (fs.existsSync(SERVER_DATA_FILE)) {
    const data = fs.readFileSync(SERVER_DATA_FILE, 'utf-8')
    componentLibrary = JSON.parse(data)
    console.log(`📚 加载组件库: ${Object.keys(componentLibrary).length} 个组件`)
  }
} catch (error) {
  console.warn('⚠️ 无法加载组件库文件:', error.message)
}

// API路由

/**
 * POST /api/component-library
 * 上传组件库
 */
app.post('/api/component-library', rateLimit(30, 60_000), (req, res) => {
  try {
    const { data } = req.body

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        error: '无效的组件库数据'
      })
    }

    // 更新内存缓存
    componentLibrary = { ...componentLibrary, ...data }

    // 保存到文件
    fs.writeFileSync(SERVER_DATA_FILE, JSON.stringify(componentLibrary, null, 2))

    console.log(`📤 接收组件库更新: ${Object.keys(data).length} 个组件`)

    res.json({
      success: true,
      message: `成功更新 ${Object.keys(data).length} 个组件`,
      totalComponents: Object.keys(componentLibrary).length
    })

  } catch (error) {
    console.error('❌ 上传组件库失败:', error)
    res.status(500).json({
      success: false,
      error: '服务器内部错误'
    })
  }
})

/**
 * GET /api/component-library
 * 获取完整组件库
 */
app.get('/api/component-library', (req, res) => {
  res.json({
    success: true,
    data: componentLibrary,
    total: Object.keys(componentLibrary).length
  })
})

/**
 * GET /api/component-library/search
 * 搜索组件
 */
app.get('/api/component-library/search', (req, res) => {
  const { q: query } = req.query

  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      success: false,
      error: '缺少搜索查询参数 q'
    })
  }

  const results = Object.entries(componentLibrary)
    .filter(([name, meta]) =>
      name.toLowerCase().includes(query.toLowerCase()) ||
      meta.description?.toLowerCase().includes(query.toLowerCase()) ||
      meta.props?.some((prop) => prop.name?.toLowerCase().includes(query.toLowerCase()))
    )
    .map(([name, meta]) => ({ name, metadata: meta }))

  res.json({
    success: true,
    data: results,
    total: results.length
  })
})

/**
 * GET /api/component-library/recommend
 * 组件推荐
 */
app.get('/api/component-library/recommend', (req, res) => {
  const { scenario } = req.query

  if (!scenario || typeof scenario !== 'string') {
    return res.status(400).json({
      success: false,
      error: '缺少场景参数 scenario'
    })
  }

  const recommendations = Object.entries(componentLibrary)
    .map(([name, meta]) => {
      let score = 0

      // 简单的推荐逻辑
      if (scenario.includes('grid') && name.toLowerCase().includes('grid')) score += 10
      if (scenario.includes('table') && name.toLowerCase().includes('table')) score += 10
      if (scenario.includes('form') && name.toLowerCase().includes('form')) score += 10
      if (scenario.includes('chart') && name.toLowerCase().includes('chart')) score += 10
      if (scenario.includes('list') && name.toLowerCase().includes('list')) score += 10
      if (scenario.includes('data') && (name.toLowerCase().includes('grid') || name.toLowerCase().includes('table'))) score += 5

      return { name, metadata: meta, score }
    })
    .filter(rec => rec.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10) // 最多返回10个推荐

  res.json({
    success: true,
    data: recommendations,
    total: recommendations.length
  })
})

/**
 * GET /api/component-library/:name
 * 查询特定组件
 */
app.get('/api/component-library/:name', (req, res) => {
  const { name } = req.params
  const component = componentLibrary[name]

  if (!component) {
    return res.status(404).json({
      success: false,
      error: `组件 "${name}" 未找到`
    })
  }

  res.json({
    success: true,
    data: component
  })
})

/**
 * GET /api/health
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    components: Object.keys(componentLibrary).length
  })
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 组件库服务端启动成功`)
  console.log(`📡 服务地址: http://localhost:${PORT}`)
  console.log(`📚 当前组件数量: ${Object.keys(componentLibrary).length}`)
  console.log('')
  console.log('📋 可用API:')
  console.log(`  POST /api/component-library     - 上传组件库`)
  console.log(`  GET  /api/component-library     - 获取完整组件库`)
  console.log(`  GET  /api/component-library/:name - 查询特定组件`)
  console.log(`  GET  /api/component-library/search?q=keyword - 搜索组件`)
  console.log(`  GET  /api/component-library/recommend?scenario=... - 组件推荐`)
  console.log(`  GET  /api/health               - 健康检查`)
  console.log('')
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务器...')
  process.exit(0)
})

export default app