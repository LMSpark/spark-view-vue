import { describe, it, expect } from 'vitest'
import { Spark } from '@spark-view/spark-core'
import { registerGlobalProvider, getGlobalProvider } from '@spark-view/spark-core'

describe('logger level filtering', () => {
  it('does not call info when provider only implements warn/error', () => {
    let calledInfo = false
    let calledWarn = false

    const provider = {
      name: 'logger',
      version: '1.0.0',
      interface: { warn: true, error: true },
      implementation: {
        warn: (...args: any[]) => { calledWarn = true },
        error: (...args: any[]) => {}
      }
    }

    const old = getGlobalProvider('logger')
    registerGlobalProvider('logger', provider as any)

    const logger = Spark.logger()
    // info is not implemented, so calling it should be a no-op (no exception)
    logger.info('should be noop')
    logger.warn('should call warn')

    expect(calledWarn).toBe(true)

    if (old) registerGlobalProvider('logger', old)
  })
})