import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'

describe('file transport (replaced by custom provider test)', () => {
  it('uses context-level logger provider', () => {
    let written = ''
    const loggerImpl = {
      info: (..._args: unknown[]) => { written += JSON.stringify(_args) },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: ComponentContext = {
      id: 'ctx-transport',
      type: 'test',
      children: [],
      state: {},
      capabilities: new Map([['logger', loggerImpl]])
    }

    const logger = Spark.Logger(ctx)
    logger.info('hello', { a: 1 })

    expect(written).toContain('hello')
  })
})