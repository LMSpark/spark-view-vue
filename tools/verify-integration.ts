/**
 * 验证 RequestConfig 和 HttpEndpoint 整合
 */

import type { RequestConfig } from '@spark-view/spark-utils'
import type { HttpEndpoint } from '@spark-view/spark-data'

// 验证 RequestConfig 包含所有必要字段
const requestConfig: RequestConfig = {
  url: '/api/test',
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  params: { id: 1 },
  data: { name: 'test' },
  timeout: 5000,
  responseType: 'json',
  cache: true,
  cacheKey: 'test-key',
  cacheExpiry: 300000,
  retry: 3,
  retryDelay: 1000,
  meta: { source: 'test' }
}

// 验证 HttpEndpoint 是独立的端点定义类型
const endpoint: HttpEndpoint = {
  url: '/api/users',
  method: 'GET',
  headers: { 'Authorization': 'Bearer token' },
  params: { page: 1, size: 20 },
  pathParams: ['users'],
}

// 验证 HttpEndpoint 字段可以扩展为 RequestConfig
const _configFromEndpoint: RequestConfig = {
  ...endpoint,
  timeout: 10000,
  cache: true
}

console.info('✅ RequestConfig 和 HttpEndpoint 整合验证成功')
console.info('RequestConfig 字段数:', Object.keys(requestConfig).length)
console.info('HttpEndpoint 字段数:', Object.keys(endpoint).length)
console.info('验证通过', _configFromEndpoint)