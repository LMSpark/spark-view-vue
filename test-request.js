// 简单测试Request类
import { Request } from './packages/spark-utils/src/Request.ts'

async function testRequest() {
  console.log('Testing Request class...')
  const request = new Request({
    baseURL: 'https://httpbin.org'
  })

  try {
    const result = await request.get('/json')
    console.log('Request successful:', result)
  } catch (error) {
    console.error('Request failed:', error.message)
  }
}

testRequest()