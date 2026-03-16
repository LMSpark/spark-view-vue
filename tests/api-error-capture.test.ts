import { afterEach, describe, expect, it, vi } from 'vitest'
import { addLogTransport, removeLogTransport, type LogTransport } from '../packages/spark-utils/src/logger'
import { FetchClient } from '../packages/spark-utils/src/http/FetchClient'

interface Captured {
  level: string
  message: string
  meta?: Record<string, unknown> | undefined
}

describe('API error capture', () => {
  const captured: Captured[] = []
  const transport: LogTransport = {
    send(level, message, meta) {
      captured.push({ level, message, meta })
    },
  }

  afterEach(() => {
    captured.length = 0
    removeLogTransport(transport)
    vi.restoreAllMocks()
  })

  it('should log HTTP response errors into logger transport', async () => {
    addLogTransport(transport)

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'boom' }), {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
      }),
    )

    const client = new FetchClient({ timeout: 1000 })

    await expect(client.get('/api/fail')).rejects.toBeDefined()

    const errLog = captured.find(item => item.level === 'error' && item.message.includes('HTTP 请求失败'))
    expect(errLog).toBeDefined()
    expect(errLog?.meta?.['url']).toBe('/api/fail')
    expect(errLog?.meta?.['status']).toBe(500)
    expect(errLog?.meta?.['code']).toBe('ERR_HTTP_500')
  })
})
