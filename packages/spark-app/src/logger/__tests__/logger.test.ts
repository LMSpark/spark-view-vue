/**
 * AppLogger 测试
 *
 * 覆盖：
 * - 日志级别过滤
 * - 前缀 & 时间戳格式化
 * - Transport 触发与错误隔离
 * - error() 方法处理 Error 对象 vs 普通对象
 * - success() 使用 console.info
 * - createScopedLogger 前缀设置
 * - createHttpTransport 仅发送 error/warn
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createAppLogger,
  createScopedLogger,
  createHttpTransport,
} from '../index'
import type { LogTransport } from '../index'

/** 安全取 mock.calls 第 N 次调用 */
function callArgs(spy: ReturnType<typeof vi.spyOn>, n = 0): unknown[] {
  return spy.mock.calls[n] ?? []
}

describe('AppLogger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── 日志级别过滤 ──

  describe('日志级别过滤', () => {
    it('level=warn → debug/info 被过滤，warn/error 输出', () => {
      const logger = createAppLogger({ level: 'warn' })

      logger.debug('d')
      logger.info('i')
      logger.warn('w')
      logger.error('e')

      expect(debugSpy).not.toHaveBeenCalled()
      expect(infoSpy).not.toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('level=debug → 所有级别输出', () => {
      const logger = createAppLogger({ level: 'debug' })

      logger.debug('d')
      logger.info('i')
      logger.warn('w')
      logger.error('e')

      expect(debugSpy).toHaveBeenCalledTimes(1)
      expect(infoSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('level=error → 仅 error 输出', () => {
      const logger = createAppLogger({ level: 'error' })

      logger.debug('d')
      logger.info('i')
      logger.warn('w')
      logger.error('e')

      expect(debugSpy).not.toHaveBeenCalled()
      expect(infoSpy).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ── 前缀 ──

  describe('前缀格式化', () => {
    it('prefix 出现在输出中', () => {
      const logger = createAppLogger({ level: 'info', prefix: 'API' })
      logger.info('hello')

      expect(infoSpy).toHaveBeenCalledTimes(1)
      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toContain('[API]')
      expect(msg).toContain('hello')
    })

    it('无 prefix 时不含方括号', () => {
      const logger = createAppLogger({ level: 'info' })
      logger.info('hello')

      const msg = String(callArgs(infoSpy)[0])
      expect(msg).not.toContain('[undefined]')
    })
  })

  // ── 时间戳 ──

  describe('时间戳', () => {
    it('showTimestamp=true → 输出包含 ISO 格式时间', () => {
      const logger = createAppLogger({ level: 'info', showTimestamp: true })
      logger.info('test')

      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toMatch(/\[\d{4}-\d{2}-\d{2}T/)
    })
  })

  // ── meta / error 对象 ──

  describe('meta 与 Error 处理', () => {
    it('info 带 meta 对象', () => {
      const logger = createAppLogger({ level: 'info' })
      const meta = { key: 'value' }
      logger.info('msg', meta)

      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('msg'), meta)
    })

    it('error 传入 Error 对象 → 提取 message + stack', () => {
      const logger = createAppLogger({ level: 'error' })
      const err = new Error('boom')
      logger.error('failed', err)

      expect(errorSpy).toHaveBeenCalledTimes(1)
      const meta = callArgs(errorSpy)[1]
      expect(meta).toHaveProperty('message', 'boom')
      expect(meta).toHaveProperty('stack')
    })

    it('error 传入普通对象 → 直通', () => {
      const logger = createAppLogger({ level: 'error' })
      const obj = { code: 500, detail: 'bad' }
      logger.error('failed', obj)

      const meta = callArgs(errorSpy)[1]
      expect(meta).toEqual(obj)
    })
  })

  // ── success ──

  describe('success', () => {
    it('success 使用 console.info + ✅ emoji', () => {
      const logger = createAppLogger({ level: 'info' })
      logger.success('done')

      expect(infoSpy).toHaveBeenCalledTimes(1)
      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toContain('✅')
      expect(msg).toContain('done')
    })
  })

  // ── Transport ──

  describe('Transport', () => {
    it('每条日志触发所有 transport', () => {
      const transport: LogTransport = { send: vi.fn() }
      const logger = createAppLogger({ level: 'debug' })
      logger.addTransport(transport)

      logger.info('hello')
      logger.warn('warning')

      expect(transport.send).toHaveBeenCalledTimes(2)
      expect(transport.send).toHaveBeenCalledWith('info', 'hello', {})
      expect(transport.send).toHaveBeenCalledWith('warn', 'warning', {})
    })

    it('transport 抛错不影响日志输出', () => {
      const badTransport: LogTransport = {
        send: () => { throw new Error('transport failure') },
      }
      const logger = createAppLogger({ level: 'info' })
      logger.addTransport(badTransport)

      expect(() => logger.info('test')).not.toThrow()
      expect(infoSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ── createScopedLogger ──

  describe('createScopedLogger', () => {
    it('scope 作为前缀', () => {
      const logger = createScopedLogger('Router', { level: 'info' })
      logger.info('navigated')

      const msg = String(callArgs(infoSpy)[0])
      expect(msg).toContain('[Router]')
    })
  })

  // ── createHttpTransport ──

  describe('createHttpTransport', () => {
    beforeEach(() => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    })

    it('仅发送 error 和 warn', async () => {
      const transport = createHttpTransport('/api/logs')

      await transport.send('debug', 'debug msg')
      await transport.send('info', 'info msg')
      await transport.send('warn', 'warn msg')
      await transport.send('error', 'error msg')

      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    })

    it('发送 JSON body 包含 level + message + timestamp', async () => {
      const transport = createHttpTransport('/api/logs')
      await transport.send('error', 'boom', { code: 500 })

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/logs',
        expect.objectContaining({
          method: 'POST',
           
          body: expect.stringContaining('"level":"error"'),
        }),
      )

      // 解析 body 验证完整结构
      const fetchSpy = vi.mocked(globalThis.fetch)
      const sentBody = String((fetchSpy.mock.calls[0]?.[1] as Record<string, unknown> | undefined)?.['body'] ?? '{}')
      const body = JSON.parse(sentBody) as Record<string, unknown>
      expect(body['message']).toBe('boom')
      expect(body['meta']).toEqual({ code: 500 })
      expect(body['timestamp']).toBeTypeOf('number')
    })

    it('fetch 失败静默（不抛错）', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('network'))
      const transport = createHttpTransport('/api/logs')

      await expect(transport.send('error', 'msg')).resolves.toBeUndefined()
    })
  })
})
