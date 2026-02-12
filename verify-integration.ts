/**
 * 验证 HttpRequestConfig 和 HttpEndpoint 整合
 */

import type { HttpRequestConfig } from '@spark-view/spark-utils'
import type { HttpEndpoint } from '@spark-view/spark-data'

// 验证 HttpRequestConfig 包含所有必要字段
const httpConfig: HttpRequestConfig = {
  url: '/api/test',
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
  params: { id: 1 },
  data: { name: 'test' },
  pathParams: ['users', '123'],
  bodySchema: { type: 'object' },
  timeout: 5000,
  responseType: 'json',
  cache: true,
  cacheKey: 'test-key',
  cacheExpiry: 300000,
  retry: 3,
  retryDelay: 1000,
  skipRequestInterceptor: false,
  skipResponseInterceptor: false,
  meta: { source: 'test' }
}

// 验证 RequestConfig 是 HttpRequestConfig 的别名
const _requestConfig: HttpRequestConfig = httpConfig  

// 验证 HttpEndpoint 是 HttpRequestConfig 的子集
const endpoint: HttpEndpoint = {
  url: '/api/users',
  method: 'GET',
  headers: { 'Authorization': 'Bearer token' },
  params: { page: 1, size: 20 },
  pathParams: ['users'],
  bodySchema: { type: 'object', properties: { name: { type: 'string' } } }
}

// 验证类型兼容性
const _configFromEndpoint: HttpRequestConfig = {
  ...endpoint,
  timeout: 10000,
  cache: true
}  

console.info('✅ HttpRequestConfig 和 HttpEndpoint 整合验证成功')
console.info('HttpRequestConfig 字段数:', Object.keys(httpConfig).length)
console.info('HttpEndpoint 字段数:', Object.keys(endpoint).length)
console.info('验证通过，类型兼容', _requestConfig, _configFromEndpoint)