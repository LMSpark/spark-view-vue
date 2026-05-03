import { describe, it, expect } from 'vitest'
import { APP_SERVICES, type IAppServicesCapability, type SparkCapabilityContext } from '@spark-view/spark-component'
import type { LoggerApi } from '@spark-view/spark-utils'

type LoggerTestAppServices = IAppServicesCapability & Required<Pick<IAppServicesCapability, 'logger' | 'router'>>

function createAppServices(logger: LoggerApi): LoggerTestAppServices {
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

describe('page logger transport payload', () => {
  it('passes structured payload through APP_SERVICES.logger', () => {
    let written = ''
    const loggerImpl: LoggerApi = {
      info: (..._args: unknown[]) => { written += JSON.stringify(_args) },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: SparkCapabilityContext = {
      id: 'ctx-transport',
      type: 'test',
      capabilities: new Map([[APP_SERVICES, createAppServices(loggerImpl)]])
    }

    const appServices = ctx.capabilities.get(APP_SERVICES) as LoggerTestAppServices
    appServices.logger.info('hello', { a: 1 })

    expect(written).toContain('hello')
  })
})
