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

describe('page logger methods', () => {
  it('warn and error stay available through APP_SERVICES.logger', () => {
    let calledWarn = false
    let calledError = false

    const loggerImpl: LoggerApi = {
      debug: (..._args: unknown[]) => {},
      info: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => { calledWarn = true },
      error: (..._args: unknown[]) => { calledError = true }
    }

    const ctx: SparkCapabilityContext = {
      id: 'ctx-level',
      type: 'test',
      capabilities: new Map([[APP_SERVICES, createAppServices(loggerImpl)]])
    }

    const appServices = ctx.capabilities.get(APP_SERVICES) as LoggerTestAppServices
    appServices.logger.warn('should call warn')
    appServices.logger.error('should call error')

    expect(calledWarn).toBe(true)
    expect(calledError).toBe(true)
  })
})
