/**
 * FileLoader 使用示例
 */

import { createFileLoader } from '@spark-view/spark-utils'

/* -----------------------------------------------------------------------------
 * 示例 1: 基本使用
 * -------------------------------------------------------------------------- */

// 创建加载器
const loader = createFileLoader({
  baseUrl: '/api/config',
  storage: 'localStorage',
  fallbackToCache: true
})

// 加载单个文件
async function loadPageConfig() {
  const result = await loader.load('home/rule.json')
  
  if (result.success) {
    console.log('✅ 加载成功')
    console.log('数据:', result.data)
    console.log('时间戳:', result.timestamp)
    console.log('来自缓存:', result.fromCache)
    
    if (result.notModified) {
      console.log('📝 文件未修改，使用缓存')
    }
  } else {
    console.error('❌ 加载失败:', result.error)
  }
}

/* -----------------------------------------------------------------------------
 * 示例 2: 批量加载
 * -------------------------------------------------------------------------- */

async function loadPageFiles() {
  // 批量加载页面的所有配置文件
  const results = await loader.loadBatch([
    'home/rule.json',
    'home/pagedata.json',
    'home/script.js'
  ])
  
  // 处理结果
  const ruleResult = results.get('home/rule.json')
  const dataResult = results.get('home/pagedata.json')
  const scriptResult = results.get('home/script.js')
  
  if (ruleResult?.success && dataResult?.success) {
    console.log('✅ 页面配置加载成功')
    
    return {
      rule: ruleResult.data,
      data: dataResult.data,
      script: scriptResult?.data || ''
    }
  } else {
    console.error('❌ 页面配置加载失败')
    return null
  }
}

/* -----------------------------------------------------------------------------
 * 示例 3: 强制刷新
 * -------------------------------------------------------------------------- */

async function refreshPageConfig() {
  // 忽略缓存，强制从服务器重新加载
  const result = await loader.load('home/rule.json', {
    forceRefresh: true
  })
  
  console.log('🔄 强制刷新完成')
  return result
}

/* -----------------------------------------------------------------------------
 * 示例 4: 加载文本文件（不解析 JSON）
 * -------------------------------------------------------------------------- */

async function loadScript() {
  const result = await loader.load<string>('home/script.js', {
    parseJSON: false  // 不解析为 JSON，直接返回字符串
  })
  
  if (result.success) {
    console.log('✅ 脚本加载成功')
    console.log('脚本内容:', result.data)
  }
  
  return result
}

/* -----------------------------------------------------------------------------
 * 示例 5: 缓存管理
 * -------------------------------------------------------------------------- */

function manageCaches() {
  // 获取缓存统计
  const stats = loader.getCacheStats()
  console.log('📊 缓存统计:')
  console.log('  文件数:', stats.totalFiles)
  console.log('  总大小:', (stats.totalSize / 1024).toFixed(2), 'KB')
  console.log('  最旧缓存:', new Date(stats.oldestCache).toLocaleString())
  console.log('  最新缓存:', new Date(stats.newestCache).toLocaleString())
  
  // 检查特定文件是否有缓存
  if (loader.hasCache('home/rule.json')) {
    const timestamp = loader.getCachedTimestamp('home/rule.json')
    console.log('📝 home/rule.json 已缓存, 时间戳:', timestamp)
  }
  
  // 清除特定文件缓存
  loader.clearCache('home/rule.json')
  console.log('🗑️ 已清除 home/rule.json 缓存')
  
  // 清除所有缓存
  loader.clearCache()
  console.log('🗑️ 已清除所有缓存')
}

/* -----------------------------------------------------------------------------
 * 示例 6: 集成到 PageRenderer
 * -------------------------------------------------------------------------- */

interface PageConfig {
  rule: unknown[]
  data: Record<string, unknown>
  script: string
}

async function loadPageWithCache(pageId: string): Promise<PageConfig | null> {
  // 使用文件加载器批量加载页面配置
  const results = await loader.loadBatch([
    `${pageId}/rule.json`,
    `${pageId}/pagedata.json`,
    `${pageId}/script.js`
  ], {
    parseJSON: true  // rule.json 和 pagedata.json 是 JSON
  })
  
  const ruleResult = results.get(`${pageId}/rule.json`)
  const dataResult = results.get(`${pageId}/pagedata.json`)
  const scriptResult = results.get(`${pageId}/script.js`)
  
  // 检查加载结果
  if (!ruleResult?.success || !dataResult?.success) {
    console.error('❌ 页面配置加载失败')
    return null
  }
  
  // 显示缓存状态
  console.log(`📦 rule.json: ${ruleResult.fromCache ? '缓存' : '网络'}`)
  console.log(`📦 pagedata.json: ${dataResult.fromCache ? '缓存' : '网络'}`)
  console.log(`📦 script.js: ${scriptResult?.fromCache ? '缓存' : '网络'}`)
  
  return {
    rule: ruleResult.data as unknown[],
    data: dataResult.data as Record<string, unknown>,
    script: (scriptResult?.data as string) || ''
  }
}

/* -----------------------------------------------------------------------------
 * 示例 7: 处理不同的后端响应格式
 * -------------------------------------------------------------------------- */

/**
 * 后端响应格式示例
 */
// @ts-expect-error - IDE 示例，不需要实际使用
interface BackendResponse {
  // 格式 1: 文件已更新
  // {
  //   "content": "{\"type\":\"div\",\"children\":[]}",
  //   "timestamp": "2024-02-11T12:00:00Z"
  // }
  
  // 格式 2: 文件未修改（约定值）
  // {
  //   "notModified": true
  // }
  
  // 格式 3: HTTP 304 Not Modified
  // (HTTP 状态码，无响应体)
}

/**
 * 三种缓存命中情况的处理逻辑
 */
async function handleDifferentResponses() {
  console.log('测试不同的后端响应格式:')
  
  // 情况 1: 首次加载（无缓存）
  console.log('\n--- 情况 1: 首次加载 ---')
  const result1 = await loader.load('new-file.json')
  console.log('首次加载:', result1.fromCache ? '来自缓存' : '来自网络')
  
  // 情况 2: 文件未修改（后端返回 notModified=true）
  console.log('\n--- 情况 2: 文件未修改（notModified=true） ---')
  const result2 = await loader.load('new-file.json')
  if (result2.notModified) {
    console.log('✅ 文件未修改，使用缓存')
  }
  
  // 情况 3: 文件未修改（后端返回 304）
  console.log('\n--- 情况 3: 文件未修改（HTTP 304） ---')
  const result3 = await loader.load('new-file.json')
  if (result3.notModified && result3.fromCache) {
    console.log('✅ 收到 304，使用缓存')
  }
  
  // 情况 4: 网络失败，自动降级
  console.log('\n--- 情况 4: 网络失败，自动降级 ---')
  const result4 = await loader.load('offline-file.json')
  if (result4.success && result4.fromCache && result4.error) {
    console.log('⚠️ 网络失败，已降级使用缓存')
    console.log('错误信息:', result4.error)
  }
}

/* -----------------------------------------------------------------------------
 * 示例 8: 自定义请求头
 * -------------------------------------------------------------------------- */

// 创建带认证的加载器
const authenticatedLoader = createFileLoader({
  baseUrl: '/api/config',
  storage: 'localStorage',
  headers: {
    'Authorization': 'Bearer your-token-here',
    'X-Tenant-Id': 'tenant-123'
  }
})

async function loadWithAuth() {
  const result = await authenticatedLoader.load('private/config.json')
  console.log('🔐 认证加载:', result.success)
  return result
}

/* -----------------------------------------------------------------------------
 * 示例 9: 不同的存储策略
 * -------------------------------------------------------------------------- */

// 使用 localStorage（跨会话持久化）
// @ts-expect-error - IDE 示例，不需要实际使用
const persistentLoader = createFileLoader({
  baseUrl: '/api/config',
  storage: 'localStorage'  // 默认值
})

// 使用 sessionStorage（仅当前会话）
// @ts-expect-error - IDE 示例，不需要实际使用
const sessionLoader = createFileLoader({
  baseUrl: '/api/config',
  storage: 'sessionStorage'
})

// 使用内存存储（不持久化，刷新页面后清空）
// @ts-expect-error - IDE 示例，不需要实际使用
const memoryLoader = createFileLoader({
  baseUrl: '/api/config',
  storage: 'memory'
})

/* -----------------------------------------------------------------------------
 * 示例 10: 禁用自动降级
 * -------------------------------------------------------------------------- */

// 创建不自动降级的加载器（网络失败直接报错）
const strictLoader = createFileLoader({
  baseUrl: '/api/config',
  fallbackToCache: false  // 禁用自动降级
})

async function loadStrict() {
  const result = await strictLoader.load('strict-file.json')
  
  if (!result.success) {
    console.error('❌ 加载失败，且未使用缓存')
    console.error('错误:', result.error)
    // 此时 result.fromCache 必定为 false
  }
  
  return result
}

/* -----------------------------------------------------------------------------
 * 导出示例函数
 * -------------------------------------------------------------------------- */

export {
  loadPageConfig,
  loadPageFiles,
  refreshPageConfig,
  loadScript,
  manageCaches,
  loadPageWithCache,
  handleDifferentResponses,
  loadWithAuth,
  loadStrict
}
