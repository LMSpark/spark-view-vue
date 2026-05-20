import { describe, it, expect } from 'vitest'
import { PAGE_RUNTIME_SERVICES } from '@spark-view/spark-page-config/page/services'
import type { CapabilityContext } from '@spark-view/spark-component'
import type { LoggerApi } from '@spark-view/spark-utils'
import { createPageRuntimeServices, readPageRuntimeServices } from './logger-test-helpers'

describe('page logger transport payload', () => {
  it('passes structured payload through PAGE_RUNTIME_SERVICES.logger', () => {
    let written = ''
    const loggerImpl: LoggerApi = {
      info: (..._args: unknown[]) => { written += JSON.stringify(_args) },
      debug: (..._args: unknown[]) => {},
      warn: (..._args: unknown[]) => {},
      error: (..._args: unknown[]) => {}
    }

    const ctx: CapabilityContext = {
      id: 'ctx-transport',
      type: 'test',
      capabilities: new Map([[PAGE_RUNTIME_SERVICES, createPageRuntimeServices(loggerImpl)]])
    }

    const pageRuntimeServices = readPageRuntimeServices(ctx)
    pageRuntimeServices.logger.info('hello', { a: 1 })

    expect(written).toContain('hello')
  })
})
