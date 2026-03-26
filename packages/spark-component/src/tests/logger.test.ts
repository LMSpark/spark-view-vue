import { describe, it, expect } from 'vitest'
import type { SparkCapabilityContext, LoggerApi } from '@spark-view/spark-component'

describe('logger capability', () => {
  it('uses context-level logger provider', () => {
    let called = false
    const loggerImpl = {
      info: (..._args: unknown[]) => { called = true },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: SparkCapabilityContext = {
      id: 'ctx-logger',
      type: 'test',
      capabilities: new Map([['logger', loggerImpl]])
    }

    const logger = ctx.capabilities.get('logger') as LoggerApi
    logger.info('test')

    expect(called).toBe(true)
  })

  it('prefers context-level logger provider over missing global', () => {
    let calledLocal = false
    const loggerImpl = {
      info: (..._args: unknown[]) => { calledLocal = true },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: SparkCapabilityContext = {
      id: 'ctx-1',
      type: 'test',
      capabilities: new Map([['logger', loggerImpl]])
    }

    const logger = ctx.capabilities.get('logger') as LoggerApi
    logger.info('hello')
    expect(calledLocal).toBe(true)
  })
})