import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-component'
import type { ComponentContext } from '@spark-view/spark-component'

describe('logger capability', () => {
  it('uses context-level logger provider', () => {
    let called = false
    const provider = {
      name: 'logger',
      interface: { info: true },
      implementation: {
        info: (..._args: unknown[]) => { called = true }
      }
    }

    const ctx: ComponentContext = {
      id: 'ctx-logger',
      type: 'test',
      children: [],
      state: {},
      providers: new Map([['logger', provider]]),
      consumers: new Map()
    }

    const logger = Spark.Logger(ctx)
    logger.info('test')

    expect(called).toBe(true)
  })

  it('prefers context-level logger provider over missing global', () => {
    let calledLocal = false
    const localProvider = {
      name: 'logger',
      interface: { info: true },
      implementation: {
        info: (..._args: unknown[]) => { calledLocal = true }
      }
    }

    const ctx: ComponentContext = {
      id: 'ctx-1',
      type: 'test',
      children: [],
      state: {},
      providers: new Map([['logger', localProvider]]),
      consumers: new Map()
    }

    const logger = Spark.Logger(ctx)
    logger.info('hello')
    expect(calledLocal).toBe(true)
  })
})