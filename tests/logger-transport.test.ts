import { describe, it, expect, vi } from 'vitest'
import { Spark, registerGlobalProvider } from '@spark-view/spark-core'

describe('file transport (replaced by custom provider test)', () => {
  it('uses registered global logger provider', () => {
    let written = ''
    const provider = {
      name: 'logger',
      version: '1.0.0',
      interface: { info: true },
      implementation: {
        info: (...args: any[]) => { written += JSON.stringify(args) }
      }
    }

    const old = (global as any).__oldLoggerProvider
    registerGlobalProvider('logger', provider as any)

    const logger = Spark.Logger()
    logger.info('hello', { a: 1 })

    expect(written).toContain('hello')

    // restore - best effort
    if (old) registerGlobalProvider('logger', old)
  })
})