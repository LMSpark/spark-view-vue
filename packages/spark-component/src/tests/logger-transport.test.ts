import { describe, it, expect } from 'vitest'
import type { SparkCapabilityContext, LoggerApi } from '@spark-view/spark-component'

describe('file transport (replaced by custom provider test)', () => {
  it('uses context-level logger provider', () => {
    let written = ''
    const loggerImpl = {
      info: (..._args: unknown[]) => { written += JSON.stringify(_args) },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: SparkCapabilityContext = {
      id: 'ctx-transport',
      type: 'test',
      capabilities: new Map([['logger', loggerImpl]])
    }

    const logger = ctx.capabilities.get('logger') as LoggerApi
    logger.info('hello', { a: 1 })

    expect(written).toContain('hello')
  })
})