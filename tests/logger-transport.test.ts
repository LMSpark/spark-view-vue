import { describe, it, expect, vi } from 'vitest'
import { Spark } from '@spark-view/spark-core'

describe('file transport (replaced by custom provider test)', () => {
  it('uses context-level logger provider', () => {
    let written = ''
    const provider = {
      name: 'logger',
      version: '1.0.0',
      interface: { info: true },
      implementation: {
        info: (...args: any[]) => { written += JSON.stringify(args) }
      }
    }

    const ctx: any = {
      id: 'ctx-transport',
      type: 'test',
      children: [],
      config: {},
      state: {},
      providers: new Set([ provider ]),
      consumers: new Map()
    }

    const logger = Spark.Logger(ctx)
    logger.info('hello', { a: 1 })

    expect(written).toContain('hello')
  })
})