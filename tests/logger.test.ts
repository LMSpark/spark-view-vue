import { describe, it, expect, vi } from 'vitest'
import { Spark } from '@spark-view/spark-core'

describe('logger capability', () => {
  it('uses context-level logger provider', () => {
    let called = false
    const provider = {
      name: 'logger',
      version: '1.0.0',
      interface: { info: true },
      implementation: {
        info: (...args: any[]) => { called = true }
      }
    }

    const ctx: any = {
      id: 'ctx-logger',
      type: 'test',
      children: [],
      config: {},
      state: {},
      providers: new Set([ provider ]),
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
      version: '1.0.0',
      interface: { info: true },
      implementation: {
        info: (...args: any[]) => { calledLocal = true }
      }
    }

    const ctx: any = {
      id: 'ctx-1',
      type: 'test',
      children: [],
      config: {},
      state: {},
      providers: new Set([ localProvider ]),
      consumers: new Map()
    }

    const logger = Spark.Logger(ctx)
    logger.info('hello')
    expect(calledLocal).toBe(true)
  })
})