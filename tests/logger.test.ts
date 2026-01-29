import { describe, it, expect, vi } from 'vitest'
import { Spark } from '../features/spark'
import { registerGlobalProvider, getGlobalProvider } from '@spark-view/spark-core'

describe('logger capability', () => {
  it('uses registered global logger provider', () => {
    let called = false
    const provider = {
      name: 'logger',
      version: '1.0.0',
      interface: { info: true },
      implementation: {
        info: (...args: any[]) => { called = true }
      }
    }

    // Keep old provider to restore later
    const old = getGlobalProvider('logger')

    registerGlobalProvider('logger', provider as any)

    const logger = Spark.logger()
    logger.info('test')

    expect(called).toBe(true)

    // restore
    if (old) {
      registerGlobalProvider('logger', old)
    }
  })

  it('prefers context-level logger provider over global', () => {
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

    const logger = Spark.logger(ctx)
    logger.info('hello')
    expect(calledLocal).toBe(true)
  })
})