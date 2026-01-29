import { describe, it, expect, vi } from 'vitest'
import { Logger, createMemoryTransport, createHttpTransport, createConsoleTransport } from '../src/utils/logger.js'

describe('logger', () => {
  it('Logger returns logging methods', () => {
    const logger = Logger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('memory transport collects logs', () => {
    const storage: any[] = []
    const transport = createMemoryTransport(storage)
    transport.log('info', 'hello', { a: 1 })
    expect(storage.length).toBe(1)
    expect(storage[0].message).toBe('hello')
  })

  it('http transport calls fetch', async () => {
    const spy = vi.fn(() => Promise.resolve({ ok: true }))
    // @ts-ignore
    global.fetch = spy
    const t = createHttpTransport('http://example.test', 'error')
    await t.log('error', 'boom')
    expect(spy).toHaveBeenCalled()
  })

  it('createConsoleTransport returns transport with level', () => {
    const t = createConsoleTransport('debug')
    expect(t).toHaveProperty('log')
  })
})