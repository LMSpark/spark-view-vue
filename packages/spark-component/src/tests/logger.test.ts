import { describe, it, expect } from 'vitest'
import { APP_SERVICES, type IAppServicesCapability, type LoggerApi } from '@spark-view/spark-utils'
import type { SparkCapabilityContext } from '@spark-view/spark-component'

function createAppServices(logger: LoggerApi): IAppServicesCapability {
  return {
    router: {
      push: async () => undefined,
      replace: async () => undefined,
      back: () => undefined,
      currentRoute: undefined,
    },
    logger,
  }
}

describe('page-level logger capability', () => {
  it('stores logger under APP_SERVICES payload', () => {
    let called = false
    const loggerImpl: LoggerApi = {
      info: (..._args: unknown[]) => { called = true },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: SparkCapabilityContext = {
      id: 'ctx-logger',
      type: 'test',
      capabilities: new Map([[APP_SERVICES, createAppServices(loggerImpl)]])
    }

    const appServices = ctx.capabilities.get(APP_SERVICES) as IAppServicesCapability
    appServices.logger.info('test')

    expect(called).toBe(true)
  })

  it('keeps router and logger together in the same page payload', async () => {
    let calledLocal = false
    const loggerImpl: LoggerApi = {
      info: (..._args: unknown[]) => { calledLocal = true },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: SparkCapabilityContext = {
      id: 'ctx-1',
      type: 'test',
      capabilities: new Map([[APP_SERVICES, createAppServices(loggerImpl)]])
    }

    const appServices = ctx.capabilities.get(APP_SERVICES) as IAppServicesCapability
    await appServices.router.push('/orders')
    appServices.logger.info('hello')

    expect(calledLocal).toBe(true)
  })
})