import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'

describe('file transport (replaced by custom provider test)', () => {
  it('uses context-level logger provider', () => {
    let written = ''
    const provider = {
      name: 'logger',
      interface: { info: true },
      implementation: {
        info: (..._args: unknown[]) => { written += JSON.stringify(_args) }
      }
    }

    const ctx: ComponentContext = {
      id: 'ctx-transport',
      type: 'test',
      children: [],
      config: {},
      state: {},
      providers: new Map([['logger', provider]]),
      consumers: new Map()
    }

    const logger = Spark.Logger(ctx)
    logger.info('hello', { a: 1 })

    expect(written).toContain('hello')
  })
})